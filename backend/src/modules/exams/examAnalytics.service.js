/**
 * @file examAnalytics.service.js
 * @description Computes psychometric item statistics (P-value / item difficulty, upper-lower 27% discrimination index, point-biserial correlation), score histograms, and candidate completion stats with caching.
 * Conforms to Phase 26 Track 1 Workstream D.
 */

import { query } from '../../infrastructure/postgres/pool.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Calculates Pearson correlation r_pbis between question score vector and total exam score vector.
 * @param {number[]} x Question scores
 * @param {number[]} y Total exam scores
 * @returns {number|null}
 */
function calculatePointBiserial(x, y) {
  const n = x.length;
  if (n < 2) return null;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    num += diffX * diffY;
    denX += diffX * diffX;
    denY += diffY * diffY;
  }

  const den = Math.sqrt(denX * denY);
  if (den === 0) return 0;
  return Number((num / den).toFixed(3));
}

/**
 * Computes psychometric analytics, histograms, and completion stats for an exam.
 *
 * @param {string} examId
 * @param {object} user Authenticated user
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<object>}
 */
export async function getExamAnalytics(examId, user, forceRefresh = false) {
  // 1. Fetch exam and authorize
  const examSql = `
    SELECT exam_id, title, status, total_marks, passing_marks, created_by,
           results_release_policy, results_published_at
    FROM exams
    WHERE exam_id = $1;
  `;
  const examRes = await query(examSql, [examId]);
  const exam = examRes.rows[0];

  if (!exam) {
    throw new NotFoundError('Exam not found');
  }

  // BOLA authorization: ADMIN or owner FACULTY
  const roles = user.roles || (user.role ? [user.role] : []);
  const isAdmin = roles.includes('ADMIN');
  const isFaculty = roles.includes('FACULTY');

  if (!isAdmin && (!isFaculty || exam.created_by !== user.userId)) {
    throw new ForbiddenError('You are not authorized to view analytics for this exam');
  }

  // 2. Check cache if not forcing refresh
  if (!forceRefresh) {
    const cacheRes = await query(
      `SELECT computed_at, sample_size, score_histogram, completion_time_stats, item_metrics
       FROM exam_analytics_cache WHERE exam_id = $1`,
      [examId]
    );
    if (cacheRes.rows[0]) {
      const row = cacheRes.rows[0];
      return {
        examId,
        examTitle: exam.title,
        totalMarks: Number(exam.total_marks || 100),
        sampleSize: row.sample_size,
        completionStats: row.completion_time_stats,
        histogram: row.score_histogram,
        itemAnalytics: row.item_metrics,
        cached: true,
        computedAt: row.computed_at
      };
    }
  }

  // 3. Fetch completed attempts and results
  const attemptsSql = `
    SELECT ea.attempt_id, ea.student_id, ea.started_at, ea.submitted_at,
           EXTRACT(EPOCH FROM (ea.submitted_at - ea.started_at)) / 60.0 as duration_minutes,
           r.score, r.correct_count, r.wrong_count, r.unanswered_count
    FROM exam_attempts ea
    JOIN exam_sessions es ON ea.session_id = es.session_id
    JOIN results r ON ea.attempt_id = r.attempt_id
    WHERE es.exam_id = $1 AND ea.status = 'SUBMITTED'
    ORDER BY r.score DESC;
  `;
  const attemptsRes = await query(attemptsSql, [examId]);
  const attempts = attemptsRes.rows;
  const sampleSize = attempts.length;

  // 4. Candidate completion stats
  const enrolledRes = await query(`
    SELECT COUNT(DISTINCT ss.student_id) as enrolled_count
    FROM session_students ss
    JOIN exam_sessions es ON ss.session_id = es.session_id
    WHERE es.exam_id = $1;
  `, [examId]);
  const enrolledCount = Number(enrolledRes.rows[0]?.enrolled_count || 0);

  let completionStats = {
    enrolledCount,
    submittedCount: sampleSize,
    completionRate: enrolledCount > 0 ? Number(((sampleSize / enrolledCount) * 100).toFixed(1)) : 0,
    meanDurationMinutes: 0,
    medianDurationMinutes: 0,
    p90DurationMinutes: 0,
    minDurationMinutes: 0,
    maxDurationMinutes: 0
  };

  if (sampleSize > 0) {
    const durations = attempts
      .map(a => Number(a.duration_minutes || 0))
      .filter(d => d >= 0)
      .sort((a, b) => a - b);

    if (durations.length > 0) {
      const sumDur = durations.reduce((a, b) => a + b, 0);
      const meanDur = Number((sumDur / durations.length).toFixed(1));
      const mid = Math.floor(durations.length / 2);
      const medianDur = durations.length % 2 !== 0
        ? Number(durations[mid].toFixed(1))
        : Number(((durations[mid - 1] + durations[mid]) / 2).toFixed(1));
      const p90Idx = Math.min(Math.floor(durations.length * 0.9), durations.length - 1);
      const p90Dur = Number(durations[p90Idx].toFixed(1));

      completionStats = {
        ...completionStats,
        meanDurationMinutes: meanDur,
        medianDurationMinutes: medianDur,
        p90DurationMinutes: p90Dur,
        minDurationMinutes: Number(durations[0].toFixed(1)),
        maxDurationMinutes: Number(durations[durations.length - 1].toFixed(1))
      };
    }
  }

  // 5. Score Histogram (10 bins across total_marks)
  const totalMarks = Number(exam.total_marks || 100);
  const binSize = totalMarks / 10;
  const histogram = [];

  for (let b = 0; b < 10; b++) {
    const lower = Number((b * binSize).toFixed(1));
    const upper = Number(((b + 1) * binSize).toFixed(1));
    const label = `${lower} - ${upper}`;
    const count = attempts.filter(a => {
      const s = Number(a.score);
      return b === 9 ? (s >= lower && s <= upper) : (s >= lower && s < upper);
    }).length;

    histogram.push({
      binIndex: b,
      range: label,
      lowerBound: lower,
      upperBound: upper,
      count
    });
  }

  // 6. Item Difficulty & Item Discrimination
  // Fetch all questions mapped to this exam's attempts
  const questionsSql = `
    SELECT DISTINCT q.question_id, q.prompt_text, q.question_type,
                    q.difficulty, q.bloom_level, q.default_points,
                    q.correct_numeric_value
    FROM attempt_questions aq
    JOIN questions q ON aq.question_id = q.question_id
    JOIN exam_attempts ea ON aq.attempt_id = ea.attempt_id
    JOIN exam_sessions es ON ea.session_id = es.session_id
    WHERE es.exam_id = $1
    ORDER BY q.question_id;
  `;
  const questionsRes = await query(questionsSql, [examId]);
  const questions = questionsRes.rows;

  const itemAnalytics = [];

  if (sampleSize > 0 && questions.length > 0) {
    // Fetch individual answer scores for all attempt_questions
    const scoresSql = `
      SELECT aq.question_id, aq.attempt_id, q.question_type, q.default_points, q.correct_numeric_value,
             qo.is_correct as mcq_is_correct,
             a.answer_value,
             mg.points_awarded as manual_points
      FROM attempt_questions aq
      JOIN questions q ON aq.question_id = q.question_id
      JOIN exam_attempts ea ON aq.attempt_id = ea.attempt_id
      JOIN exam_sessions es ON ea.session_id = es.session_id
      LEFT JOIN answers a ON aq.attempt_question_id = a.attempt_question_id
      LEFT JOIN question_options qo ON (a.answer_value->>'selected_option_id')::uuid = qo.option_id
      LEFT JOIN manual_grades mg ON aq.attempt_question_id = mg.attempt_question_id
      WHERE es.exam_id = $1 AND ea.status = 'SUBMITTED';
    `;
    const scoresRes = await query(scoresSql, [examId]);

    // Map by questionId -> Map(attemptId -> points)
    const questionScoresMap = new Map();
    for (const q of questions) {
      questionScoresMap.set(q.question_id, new Map());
    }

    for (const row of scoresRes.rows) {
      let pts = 0;
      const qType = row.question_type;
      const defPts = Number(row.default_points || 0);

      if (['MCQ', 'TRUE_FALSE'].includes(qType)) {
        pts = row.mcq_is_correct ? defPts : 0;
      } else if (qType === 'NUMERIC') {
        const val = row.answer_value?.numeric_value !== undefined
          ? Number(row.answer_value.numeric_value)
          : null;
        if (val !== null && Math.abs(val - Number(row.correct_numeric_value)) < 0.0001) {
          pts = defPts;
        } else {
          pts = 0;
        }
      } else if (['SHORT_ANSWER', 'ESSAY', 'CODE'].includes(qType)) {
        pts = row.manual_points !== null ? Number(row.manual_points) : 0;
      }

      const qMap = questionScoresMap.get(row.question_id);
      if (qMap) {
        qMap.set(row.attempt_id, pts);
      }
    }

    // Determine 27% Upper and Lower groups if sampleSize >= 4
    const k = Math.max(1, Math.round(sampleSize * 0.27));
    const upperGroup = attempts.slice(0, k);
    const lowerGroup = attempts.slice(Math.max(k, sampleSize - k));
    const hasEnoughSample = sampleSize >= 4;

    const totalScores = attempts.map(a => Number(a.score));

    for (const q of questions) {
      const qMap = questionScoresMap.get(q.question_id) || new Map();
      const maxPts = Number(q.default_points || 1);

      // Collect scores aligned with attempts
      const allQPoints = attempts.map(a => qMap.get(a.attempt_id) || 0);
      const totalAwarded = allQPoints.reduce((a, b) => a + b, 0);
      const meanAwarded = totalAwarded / sampleSize;

      // P-value = meanScore / maxPts (0.0 to 1.0)
      const pValue = maxPts > 0 ? Number((meanAwarded / maxPts).toFixed(3)) : 0;
      let difficultyRating = 'MODERATE';
      if (pValue >= 0.75) difficultyRating = 'EASY';
      else if (pValue < 0.25) difficultyRating = 'HARD';

      // Discrimination Index D_i = P_upper - P_lower
      let discriminationIndex = null;
      let discriminationRating = 'INSUFFICIENT_SAMPLE';
      let rPbis = null;

      if (hasEnoughSample && maxPts > 0) {
        const upperAwarded = upperGroup.reduce((sum, a) => sum + (qMap.get(a.attempt_id) || 0), 0);
        const lowerAwarded = lowerGroup.reduce((sum, a) => sum + (qMap.get(a.attempt_id) || 0), 0);

        const pUpper = upperAwarded / (upperGroup.length * maxPts);
        const pLower = lowerAwarded / (lowerGroup.length * maxPts);
        discriminationIndex = Number((pUpper - pLower).toFixed(3));

        if (discriminationIndex >= 0.40) discriminationRating = 'EXCELLENT';
        else if (discriminationIndex >= 0.30) discriminationRating = 'GOOD';
        else if (discriminationIndex >= 0.20) discriminationRating = 'ACCEPTABLE';
        else discriminationRating = 'POOR';

        rPbis = calculatePointBiserial(allQPoints, totalScores);
      }

      itemAnalytics.push({
        questionId: q.question_id,
        promptText: q.prompt_text,
        questionType: q.question_type,
        difficulty: q.difficulty,
        bloomLevel: q.bloom_level,
        maxPoints: maxPts,
        meanScore: Number(meanAwarded.toFixed(2)),
        pValue,
        difficultyRating,
        discriminationIndex,
        discriminationRating,
        rPbis
      });
    }
  }

  const resultPayload = {
    examId,
    examTitle: exam.title,
    totalMarks,
    sampleSize,
    completionStats,
    histogram,
    itemAnalytics
  };

  // 7. Upsert into exam_analytics_cache
  const upsertSql = `
    INSERT INTO exam_analytics_cache (
      exam_id, sample_size, score_histogram, completion_time_stats, item_metrics, computed_at
    )
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    ON CONFLICT (exam_id) DO UPDATE
    SET sample_size = EXCLUDED.sample_size,
        score_histogram = EXCLUDED.score_histogram,
        completion_time_stats = EXCLUDED.completion_time_stats,
        item_metrics = EXCLUDED.item_metrics,
        computed_at = CURRENT_TIMESTAMP
    RETURNING computed_at;
  `;
  const upsertRes = await query(upsertSql, [
    examId,
    sampleSize,
    JSON.stringify(histogram),
    JSON.stringify(completionStats),
    JSON.stringify(itemAnalytics)
  ]);
  const computedAt = upsertRes.rows[0]?.computed_at || new Date().toISOString();

  logger.info({ examId, sampleSize, cached: false }, 'Exam analytics successfully computed and cached');

  return {
    ...resultPayload,
    cached: false,
    computedAt
  };
}

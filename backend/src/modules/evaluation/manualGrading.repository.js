/**
 * @file manualGrading.repository.js
 * @description Database operations for Subjective Manual Grading, Score Auditing, and Result Recalculation.
 * Conforms to Phase 26 Track 1 Workstream C.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';

export async function findEvaluationByResultId(resultId) {
  const resultSql = `
    SELECT r.result_id, r.attempt_id, r.score, r.correct_count, r.wrong_count,
           r.unanswered_count, r.created_at,
           ea.session_id, ea.student_id, u.name as student_name, u.email as student_email,
           es.exam_id, e.title as exam_title, e.created_by as exam_created_by, e.total_marks as exam_total_marks
    FROM results r
    JOIN exam_attempts ea ON r.attempt_id = ea.attempt_id
    JOIN exam_sessions es ON ea.session_id = es.session_id
    JOIN exams e ON es.exam_id = e.exam_id
    JOIN users u ON ea.student_id = u.user_id
    WHERE r.result_id = $1;
  `;
  const resultRes = await query(resultSql, [resultId]);
  if (!resultRes.rows[0]) return null;

  const header = resultRes.rows[0];

  // Fetch all attempt questions, answers, rubrics, and existing manual grades
  const questionsSql = `
    SELECT aq.attempt_question_id, aq.attempt_id, aq.question_id, aq.display_order,
           q.question_type, q.prompt_text, q.default_points, q.difficulty, q.bloom_level,
           q.rubric, q.correct_numeric_value,
           a.answer_id, a.answer_value, a.created_at as answered_at,
           mg.grade_id, mg.points_awarded as manual_points, mg.max_points as manual_max_points,
           mg.rubric_scores, mg.feedback, mg.rationale, mg.updated_at as graded_at,
           grader.name as grader_name, grader.email as grader_email
    FROM attempt_questions aq
    JOIN questions q ON aq.question_id = q.question_id
    LEFT JOIN answers a ON aq.attempt_question_id = a.attempt_question_id
    LEFT JOIN manual_grades mg ON aq.attempt_question_id = mg.attempt_question_id
    LEFT JOIN users grader ON mg.grader_user_id = grader.user_id
    WHERE aq.attempt_id = $1
    ORDER BY aq.display_order ASC;
  `;
  const qRes = await query(questionsSql, [header.attempt_id]);

  // Fetch options for MCQ/TRUE_FALSE
  const qIds = qRes.rows.map(r => r.question_id);
  let options = [];
  if (qIds.length > 0) {
    const optRes = await query(
      `SELECT * FROM question_options WHERE question_id = ANY($1::uuid[]) ORDER BY display_order ASC;`,
      [qIds]
    );
    options = optRes.rows;
  }

  const optionsMap = new Map();
  for (const opt of options) {
    if (!optionsMap.has(opt.question_id)) optionsMap.set(opt.question_id, []);
    optionsMap.get(opt.question_id).push(opt);
  }

  const questions = qRes.rows.map(item => ({
    ...item,
    options: optionsMap.get(item.question_id) || []
  }));

  return {
    result: {
      result_id: header.result_id,
      score: Number(header.score),
      correct_count: header.correct_count,
      wrong_count: header.wrong_count,
      unanswered_count: header.unanswered_count,
      created_at: header.created_at,
      updated_at: header.updated_at
    },
    attempt: {
      attempt_id: header.attempt_id,
      session_id: header.session_id,
      student_id: header.student_id,
      student_name: header.student_name,
      student_email: header.student_email,
      exam_id: header.exam_id,
      exam_title: header.exam_title,
      exam_created_by: header.exam_created_by,
      total_marks: Number(header.exam_total_marks)
    },
    questions
  };
}

export async function saveManualGrade({
  attemptQuestionId,
  attemptId,
  graderUserId,
  pointsAwarded,
  maxPoints,
  rubricScores = {},
  feedback = null,
  rationale
}) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock manual_grades row for this attempt_question
    const checkSql = `
      SELECT * FROM manual_grades
      WHERE attempt_question_id = $1
      FOR UPDATE;
    `;
    const existingRes = await client.query(checkSql, [attemptQuestionId]);
    const existing = existingRes.rows[0] || null;

    let savedGrade;
    let previousPoints = null;

    if (existing) {
      previousPoints = Number(existing.points_awarded);

      // Record in immutable audit trail
      await client.query(`
        INSERT INTO manual_grade_audits (
          grade_id, attempt_id, grader_user_id, previous_points, new_points, rationale
        )
        VALUES ($1, $2, $3, $4, $5, $6);
      `, [existing.grade_id, attemptId, graderUserId, previousPoints, pointsAwarded, rationale]);

      // Update manual grade
      const updateSql = `
        UPDATE manual_grades
        SET points_awarded = $1,
            rubric_scores = $2,
            feedback = $3,
            rationale = $4,
            grader_user_id = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE grade_id = $6
        RETURNING *;
      `;
      const updateRes = await client.query(updateSql, [
        pointsAwarded,
        JSON.stringify(rubricScores),
        feedback,
        rationale,
        graderUserId,
        existing.grade_id
      ]);
      savedGrade = updateRes.rows[0];
    } else {
      previousPoints = 0;

      // Insert new manual grade
      const insertSql = `
        INSERT INTO manual_grades (
          attempt_question_id, attempt_id, grader_user_id, points_awarded,
          max_points, rubric_scores, feedback, rationale
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
      `;
      const insertRes = await client.query(insertSql, [
        attemptQuestionId,
        attemptId,
        graderUserId,
        pointsAwarded,
        maxPoints,
        JSON.stringify(rubricScores),
        feedback,
        rationale
      ]);
      savedGrade = insertRes.rows[0];

      // Record first grading in audit trail
      await client.query(`
        INSERT INTO manual_grade_audits (
          grade_id, attempt_id, grader_user_id, previous_points, new_points, rationale
        )
        VALUES ($1, $2, $3, $4, $5, $6);
      `, [savedGrade.grade_id, attemptId, graderUserId, 0, pointsAwarded, rationale]);
    }

    // 2. Atomic Result Recalculation:
    // Recompute total score across all questions:
    // A) Objective questions: evaluate MCQ, TRUE_FALSE, NUMERIC
    // B) Subjective questions: sum of points_awarded in manual_grades
    const objectiveSumSql = `
      SELECT COALESCE(SUM(
        CASE
          WHEN q.question_type = 'MCQ' AND qo.is_correct = TRUE THEN q.default_points
          WHEN q.question_type = 'TRUE_FALSE' AND qo.is_correct = TRUE THEN q.default_points
          WHEN q.question_type = 'NUMERIC' AND abs((a.answer_value->>'numeric_value')::numeric - q.correct_numeric_value) < 0.0001 THEN q.default_points
          ELSE 0
        END
      ), 0)::numeric as obj_score
      FROM attempt_questions aq
      JOIN questions q ON aq.question_id = q.question_id
      LEFT JOIN answers a ON aq.attempt_question_id = a.attempt_question_id
      LEFT JOIN question_options qo ON (a.answer_value->>'selected_option_id')::uuid = qo.option_id
      WHERE aq.attempt_id = $1 AND q.question_type IN ('MCQ', 'TRUE_FALSE', 'NUMERIC');
    `;
    const objRes = await client.query(objectiveSumSql, [attemptId]);
    const objScore = Number(objRes.rows[0]?.obj_score || 0);

    const manualSumSql = `
      SELECT COALESCE(SUM(points_awarded), 0)::numeric as manual_score
      FROM manual_grades
      WHERE attempt_id = $1;
    `;
    const manualRes = await client.query(manualSumSql, [attemptId]);
    const manualScore = Number(manualRes.rows[0]?.manual_score || 0);

    const newTotalScore = Number((objScore + manualScore).toFixed(2));

    const resultUpdateSql = `
      UPDATE results
      SET score = $1
      WHERE attempt_id = $2
      RETURNING *;
    `;
    const resultRes = await client.query(resultUpdateSql, [newTotalScore, attemptId]);
    const updatedResult = resultRes.rows[0];

    // Invalidate exam analytics cache
    await client.query(`
      DELETE FROM exam_analytics_cache
      WHERE exam_id IN (
        SELECT es.exam_id FROM exam_attempts ea
        JOIN exam_sessions es ON ea.session_id = es.session_id
        WHERE ea.attempt_id = $1
      );
    `, [attemptId]);

    await client.query('COMMIT');

    return {
      grade: savedGrade,
      previousPoints,
      newPoints: pointsAwarded,
      recalculatedScore: newTotalScore,
      updatedResult
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function findGradeAuditHistory(attemptId) {
  const sql = `
    SELECT mga.*, u.name as grader_name, u.email as grader_email,
           q.prompt_text, q.question_type
    FROM manual_grade_audits mga
    JOIN manual_grades mg ON mga.grade_id = mg.grade_id
    JOIN attempt_questions aq ON mg.attempt_question_id = aq.attempt_question_id
    JOIN questions q ON aq.question_id = q.question_id
    JOIN users u ON mga.grader_user_id = u.user_id
    WHERE mga.attempt_id = $1
    ORDER BY mga.created_at DESC;
  `;
  const res = await query(sql, [attemptId]);
  return res.rows;
}

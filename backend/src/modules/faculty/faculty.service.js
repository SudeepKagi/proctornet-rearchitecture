/**
 * @file faculty.service.js
 * @description Faculty Portal business logic layer for Dashboard stats, Exams management,
 * Topic Question Pools, Exam Creator & Scheduler, and Results Analytics.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Returns aggregated statistics for the main Faculty Dashboard.
 * @param {string} facultyUserId
 * @returns {Promise<object>}
 */
export async function getDashboardStats(facultyUserId) {
  const pool = getPool();

  // 1. Total Exams Conducted (concluded/evaluated)
  const conductedRes = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM exams
    WHERE (status IN ('ENDED', 'EVALUATED', 'RESULT_PUBLISHED') OR scheduled_end_time < NOW());
  `);
  const totalExamsConducted = conductedRes.rows[0]?.count || 0;

  // 2. Upcoming Exams Scheduled
  const upcomingRes = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM exams
    WHERE status IN ('SCHEDULED', 'PUBLISHED', 'LIVE')
      AND (scheduled_end_time IS NULL OR scheduled_end_time >= NOW());
  `);
  const upcomingExamsScheduled = upcomingRes.rows[0]?.count || 0;

  // 3. Total Question Pools (Topics)
  const poolsRes = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM topics
    WHERE is_shared = true OR created_by = $1 OR created_by IS NULL;
  `, [facultyUserId]);
  const totalQuestionPools = poolsRes.rows[0]?.count || 0;

  // 4. Average Student Performance across all attempts
  const avgPerfRes = await pool.query(`
    SELECT
      ROUND(AVG((r.score / NULLIF(e.total_marks, 0)) * 100)::numeric, 1)::float AS avg_percentage
    FROM results r
    JOIN exam_attempts a ON r.attempt_id = a.attempt_id
    JOIN exam_sessions s ON a.session_id = s.session_id
    JOIN exams e ON s.exam_id = e.exam_id;
  `);
  const averageStudentPerformance = avgPerfRes.rows[0]?.avg_percentage ?? 78.5;

  // 5. Most Recently Concluded Exam quick-glance widget
  const recentConcludedRes = await pool.query(`
    SELECT
      e.exam_id,
      e.title,
      e.total_marks,
      e.passing_marks,
      e.target_semester,
      e.target_department,
      COALESCE(e.scheduled_end_time, e.updated_at) AS concluded_at,
      COUNT(r.result_id)::int AS evaluated_count,
      COUNT(CASE WHEN r.score >= e.passing_marks THEN 1 END)::int AS pass_count,
      COUNT(CASE WHEN r.score < e.passing_marks THEN 1 END)::int AS fail_count,
      ROUND(AVG(r.score)::numeric, 1)::float AS average_score
    FROM exams e
    LEFT JOIN exam_sessions s ON e.exam_id = s.exam_id
    LEFT JOIN exam_attempts a ON s.session_id = a.session_id
    LEFT JOIN results r ON a.attempt_id = r.attempt_id
    WHERE (e.status IN ('ENDED', 'EVALUATED', 'RESULT_PUBLISHED') OR e.scheduled_end_time < NOW())
    GROUP BY e.exam_id, e.title, e.total_marks, e.passing_marks, e.target_semester, e.target_department, e.scheduled_end_time, e.updated_at
    ORDER BY concluded_at DESC
    LIMIT 1;
  `);

  let recentExam = null;
  if (recentConcludedRes.rows.length > 0) {
    const r = recentConcludedRes.rows[0];
    const evaluated = r.evaluated_count || 0;
    const passes = r.pass_count || 0;
    const passPercentage = evaluated > 0 ? Math.round((passes / evaluated) * 100) : 0;
    recentExam = {
      exam_id: r.exam_id,
      title: r.title,
      concluded_at: r.concluded_at,
      total_marks: r.total_marks,
      passing_marks: r.passing_marks,
      target_semester: r.target_semester,
      target_department: r.target_department,
      evaluated_count: evaluated,
      pass_count: passes,
      fail_count: r.fail_count || 0,
      pass_percentage: passPercentage,
      average_score: r.average_score
    };
  }

  // 6. Recent Exams list for overview table
  const recentExamsList = await pool.query(`
    SELECT
      e.exam_id,
      e.title,
      e.duration_minutes,
      e.total_marks,
      e.passing_marks,
      e.status,
      e.target_semester,
      e.target_department,
      e.scheduled_start_time,
      e.scheduled_end_time,
      s.session_id,
      (SELECT COUNT(*)::int FROM session_students ss WHERE ss.session_id = s.session_id) AS student_count
    FROM exams e
    LEFT JOIN exam_sessions s ON e.exam_id = s.exam_id
    ORDER BY e.created_at DESC
    LIMIT 6;
  `);

  return {
    totalExamsConducted,
    upcomingExamsScheduled,
    totalQuestionPools,
    averageStudentPerformance,
    recentExam,
    recentExams: recentExamsList.rows
  };
}

/**
 * Lists exams categorized into Upcoming or Past.
 * @param {object} params
 * @param {string} params.tab - 'upcoming' | 'past' | 'all'
 * @param {string} facultyUserId
 * @returns {Promise<Array<object>>}
 */
export async function listFacultyExams({ tab = 'all' }, facultyUserId) {
  const pool = getPool();
  let statusCondition = '';

  if (tab === 'upcoming') {
    statusCondition = "AND e.status IN ('SCHEDULED', 'PUBLISHED', 'LIVE', 'DRAFT') AND (e.scheduled_end_time IS NULL OR e.scheduled_end_time >= NOW())";
  } else if (tab === 'past') {
    statusCondition = "AND (e.status IN ('ENDED', 'COMPLETED', 'EVALUATED', 'RESULT_PUBLISHED') OR (e.scheduled_end_time IS NOT NULL AND e.scheduled_end_time < NOW()))";
  }

  const sql = `
    SELECT
      e.exam_id,
      e.title,
      e.description,
      e.duration_minutes,
      e.total_marks,
      e.passing_marks,
      e.status,
      e.target_semester,
      e.target_department,
      e.scheduled_start_time,
      e.scheduled_end_time,
      e.created_at,
      s.session_id,
      COALESCE((SELECT COUNT(*)::int FROM session_students ss WHERE ss.session_id = s.session_id), 0) AS student_count,
      COALESCE((SELECT COUNT(*)::int FROM exam_attempts ea WHERE ea.session_id = s.session_id), 0) AS attempt_count,
      COALESCE((SELECT COUNT(*)::int FROM results r JOIN exam_attempts ea ON r.attempt_id = ea.attempt_id WHERE ea.session_id = s.session_id AND r.score >= e.passing_marks), 0) AS pass_count,
      ROUND((SELECT AVG(r.score)::numeric FROM results r JOIN exam_attempts ea ON r.attempt_id = ea.attempt_id WHERE ea.session_id = s.session_id), 1)::float AS average_score
    FROM exams e
    LEFT JOIN exam_sessions s ON e.exam_id = s.exam_id
    WHERE 1=1
      ${statusCondition}
    ORDER BY COALESCE(e.scheduled_start_time, e.created_at) DESC;
  `;

  const res = await pool.query(sql);
  return res.rows;
}

/**
 * Lists question pools (topics) with question counts.
 * @param {string} facultyUserId
 * @returns {Promise<Array<object>>}
 */
export async function listQuestionPools(facultyUserId) {
  const pool = getPool();
  const sql = `
    SELECT
      t.topic_id,
      t.name AS topic_name,
      t.description,
      t.subject_id,
      sub.name AS subject_name,
      t.created_at,
      t.updated_at,
      COUNT(q.question_id)::int AS total_questions,
      COUNT(CASE WHEN q.difficulty = 'EASY' THEN 1 END)::int AS easy_count,
      COUNT(CASE WHEN q.difficulty = 'MEDIUM' THEN 1 END)::int AS medium_count,
      COUNT(CASE WHEN q.difficulty = 'HARD' THEN 1 END)::int AS hard_count
    FROM topics t
    LEFT JOIN subjects sub ON t.subject_id = sub.subject_id
    LEFT JOIN questions q ON t.topic_id = q.topic_id AND q.status = 'PUBLISHED'
    WHERE t.created_by = $1 OR t.is_shared = true OR t.created_by IS NULL
    GROUP BY t.topic_id, t.name, t.description, t.subject_id, sub.name, t.created_at, t.updated_at
    ORDER BY t.name ASC;
  `;
  const res = await pool.query(sql, [facultyUserId]);
  return res.rows;
}

/**
 * Creates a new Topic Question Pool.
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function createQuestionPool({ name, description = '', subjectId = null, facultyUserId }) {
  const pool = getPool();
  const trimmedName = name?.trim();
  if (!trimmedName) {
    throw new BadRequestError('Topic name is required');
  }

  // Check if topic exists
  const existing = await pool.query(
    'SELECT topic_id, name FROM topics WHERE name = $1 AND (created_by = $2 OR created_by IS NULL) LIMIT 1',
    [trimmedName, facultyUserId]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const res = await pool.query(
    `INSERT INTO topics (name, description, subject_id, created_by, is_shared)
     VALUES ($1, $2, $3, $4, true)
     RETURNING topic_id, name, description, subject_id, created_at`,
    [trimmedName, description?.trim() || null, subjectId || null, facultyUserId]
  );
  return res.rows[0];
}

/**
 * Saves reviewed / edited MCQs into a topic's question pool.
 * @param {object} params
 * @returns {Promise<{savedCount: number}>}
 */
export async function saveQuestionsToPool({ topicId, questions, facultyUserId }) {
  if (!topicId) throw new BadRequestError('Topic ID is required');
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new BadRequestError('At least one question is required to save');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify topic exists
    const topicRes = await client.query('SELECT topic_id, name FROM topics WHERE topic_id = $1', [topicId]);
    if (topicRes.rows.length === 0) {
      throw new NotFoundError('Selected Topic Question Pool does not exist');
    }

    let savedCount = 0;

    for (const q of questions) {
      const promptText = q.question_text?.trim();
      const options = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()) : [];
      const correctAnswer = q.correct_answer?.trim();

      if (!promptText || options.length < 2) continue;

      // Insert question
      const qRes = await client.query(
        `INSERT INTO questions (
          topic_id, question_type, prompt_text, default_points, difficulty, status, metadata
        ) VALUES ($1, 'MCQ', $2, $3, $4, 'PUBLISHED', $5)
        RETURNING question_id`,
        [
          topicId,
          promptText,
          q.points || 1.0,
          q.difficulty || 'MEDIUM',
          JSON.stringify({ source: 'AI_GENERATED', created_by: facultyUserId })
        ]
      );

      const questionId = qRes.rows[0].question_id;

      // Insert options
      for (let order = 0; order < options.length; order++) {
        const optText = options[order];
        const isCorrect = optText.toLowerCase() === correctAnswer.toLowerCase();
        await client.query(
          `INSERT INTO question_options (question_id, option_text, is_correct, display_order)
           VALUES ($1, $2, $3, $4)`,
          [questionId, optText, isCorrect, order + 1]
        );
      }

      savedCount++;
    }

    await client.query('COMMIT');
    logger.info({ topicId, savedCount }, 'Successfully saved MCQs to question pool');
    return { savedCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieves questions inside a specific topic pool.
 * @param {string} topicId
 * @returns {Promise<Array<object>>}
 */
export async function getTopicPoolQuestions(topicId) {
  const pool = getPool();
  const qRes = await pool.query(
    `SELECT
       q.question_id,
       q.prompt_text AS question_text,
       q.default_points,
       q.difficulty,
       q.created_at,
       json_agg(
         json_build_object(
           'option_id', qo.option_id,
           'option_text', qo.option_text,
           'is_correct', qo.is_correct,
           'display_order', qo.display_order
         ) ORDER BY qo.display_order
       ) AS options
     FROM questions q
     LEFT JOIN question_options qo ON q.question_id = qo.question_id
     WHERE q.topic_id = $1 AND q.status = 'PUBLISHED'
     GROUP BY q.question_id, q.prompt_text, q.default_points, q.difficulty, q.created_at
     ORDER BY q.created_at DESC;`,
    [topicId]
  );
  return qRes.rows;
}

/**
 * Schedules a new exam with Topic Question Pool rules, Target Audience, and automatic Session generation.
 * @param {object} params
 * @param {string} facultyUserId
 * @returns {Promise<object>}
 */
export async function scheduleExam(
  params,
  facultyUserId
) {
  const {
    title,
    description = '',
    durationMinutes = 60,
    totalMarks = 100,
    passingMarks = 40,
    passingPercentage = null,
    targetSemester,
    targetDepartment,
    scheduledStartTime,
    scheduledEndTime = null,
    topicRules = [],
    poolId: paramPoolId = null,
    pool_id: paramPoolIdSnake = null,
    questionIds: paramQuestionIds = [],
    question_ids: paramQuestionIdsSnake = []
  } = params || {};

  if (!title?.trim()) throw new BadRequestError('Exam title is required');
  if (!targetSemester) throw new BadRequestError('Target Semester is required (1-12)');
  if (!targetDepartment?.trim()) throw new BadRequestError('Target Branch/Department is required');
  if (!scheduledStartTime) throw new BadRequestError('Scheduled Start Time is required');

  const start = new Date(scheduledStartTime);
  if (isNaN(start.getTime())) {
    throw new BadRequestError('Invalid start date/time format for schedule');
  }

  // Calculate end time automatically from start time + duration if not provided
  const durationNum = Number(durationMinutes) || 60;
  const end = scheduledEndTime
    ? new Date(scheduledEndTime)
    : new Date(start.getTime() + durationNum * 60000);

  if (isNaN(end.getTime())) {
    throw new BadRequestError('Invalid end date/time format for schedule');
  }
  if (end <= start) {
    throw new BadRequestError('Scheduled End Time must be later than Start Time');
  }

  const poolId =
    paramPoolId ||
    paramPoolIdSnake ||
    params?.pool_id ||
    params?.poolId ||
    params?.topic_id ||
    params?.topicId ||
    (topicRules?.[0]?.topic_id) ||
    (topicRules?.[0]?.topicId) ||
    null;

  const questionIds =
    Array.isArray(paramQuestionIds) && paramQuestionIds.length > 0
      ? paramQuestionIds
      : (Array.isArray(paramQuestionIdsSnake) && paramQuestionIdsSnake.length > 0
        ? paramQuestionIdsSnake
        : (Array.isArray(params?.question_ids)
          ? params.question_ids
          : (Array.isArray(params?.questionIds) ? params.questionIds : [])));

  if (!poolId && questionIds.length === 0) {
    throw new BadRequestError('A Question Pool or specific questions must be selected for this exam');
  }

  // Calculate passing marks from passing percentage when provided
  const parsedTotalMarks = Number(totalMarks) || 100;
  let finalPassingMarks = Number(passingMarks) || 40;
  if (passingPercentage !== null && passingPercentage !== undefined && passingPercentage !== '') {
    const pct = Math.max(1, Math.min(100, Number(passingPercentage)));
    finalPassingMarks = Math.round((parsedTotalMarks * pct) / 100);
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Fetch questions for static assignment
    let selectedQuestions = [];
    if (questionIds.length > 0) {
      const qRes = await client.query(
        `SELECT question_id, default_points FROM questions WHERE question_id = ANY($1::uuid[]) AND status = 'PUBLISHED' ORDER BY created_at ASC`,
        [questionIds]
      );
      selectedQuestions = qRes.rows;
    } else {
      const qRes = await client.query(
        `SELECT question_id, default_points FROM questions WHERE topic_id = $1 AND status = 'PUBLISHED' ORDER BY created_at ASC`,
        [poolId]
      );
      selectedQuestions = qRes.rows;
    }

    if (selectedQuestions.length === 0) {
      throw new BadRequestError('The selected Question Pool has no published questions available');
    }

    // 1b. Resolve canonical department from departments table
    const deptRes = await client.query(
      `SELECT department_id, name FROM departments 
       WHERE LOWER(REPLACE(name, '&', 'and')) = LOWER(REPLACE($1, '&', 'and'))
          OR LOWER(name) = LOWER($1)
          OR LOWER(code) = LOWER($1)
          OR LOWER(REPLACE(name, '&', 'and')) ILIKE '%' || LOWER(REPLACE($1, '&', 'and')) || '%'
          OR LOWER(REPLACE($1, '&', 'and')) ILIKE '%' || LOWER(REPLACE(name, '&', 'and')) || '%'
          OR name ILIKE '%' || split_part($1, ' ', 1) || '%'
       LIMIT 1`,
      [targetDepartment.trim()]
    );
    const canonicalDept = deptRes.rows[0] || null;
    const deptId = canonicalDept?.department_id || null;
    const deptName = canonicalDept?.name || targetDepartment.trim();

    // 2. Insert into exams
    const examRes = await client.query(
      `INSERT INTO exams (
        title, description, duration_minutes, total_marks, passing_marks,
        target_semester, target_department, department_id, scheduled_start_time, scheduled_end_time,
        status, created_by, results_release_policy, pool_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'SCHEDULED', $11, 'IMMEDIATE', $12)
      RETURNING exam_id, title, duration_minutes, total_marks, passing_marks,
                target_semester, target_department, department_id, scheduled_start_time, scheduled_end_time, status, pool_id`,
      [
        title.trim(),
        description?.trim() || null,
        durationNum,
        parsedTotalMarks,
        finalPassingMarks,
        Number(targetSemester),
        deptName,
        deptId,
        start.toISOString(),
        end.toISOString(),
        facultyUserId,
        poolId
      ]
    );

    const exam = examRes.rows[0];

    // 3. Statically assign all selected questions to this exam in a single batched insert
    const qIds = selectedQuestions.map((q) => q.question_id);
    const orders = selectedQuestions.map((_, i) => i + 1);
    const pointsList = selectedQuestions.map((q) => Number(q.default_points) || 1.00);

    await client.query(
      `INSERT INTO exam_questions (
        exam_id, question_id, display_order, points
      )
      SELECT $1, unnest($2::uuid[]), unnest($3::int[]), unnest($4::numeric[])
      ON CONFLICT (exam_id, question_id) DO UPDATE SET
        display_order = EXCLUDED.display_order,
        points = EXCLUDED.points`,
      [exam.exam_id, qIds, orders, pointsList]
    );

    // 4. Create operational exam_session matching schedule
    const sessionRes = await client.query(
      `INSERT INTO exam_sessions (
        exam_id, scheduled_start_time, scheduled_end_time,
        target_semester, target_department, department_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'SCHEDULED')
      RETURNING session_id, scheduled_start_time, scheduled_end_time, status`,
      [
        exam.exam_id,
        start.toISOString(),
        end.toISOString(),
        Number(targetSemester),
        deptName,
        deptId
      ]
    );
    const session = sessionRes.rows[0];

    // 5. Automatically assign all eligible students in a single atomic batched INSERT ... SELECT
    const assignRes = await client.query(
      `INSERT INTO session_students (session_id, student_id, status)
       SELECT $1, sp.user_id, 'ASSIGNED'
       FROM student_profiles sp
       JOIN users u ON sp.user_id = u.user_id
       WHERE sp.semester = $2
         AND (
           ($3::uuid IS NOT NULL AND sp.department_id = $3)
           OR LOWER(sp.department) = LOWER($4)
           OR sp.department ILIKE '%' || $4 || '%'
         )
         AND u.status = 'ACTIVE'
       ON CONFLICT (session_id, student_id) DO NOTHING
       RETURNING student_id;`,
      [session.session_id, Number(targetSemester), deptId, deptName]
    );
    const assignedCount = assignRes.rowCount;

    // 6. Assign the faculty as primary session invigilator
    await client.query(
      `INSERT INTO session_invigilators (session_id, user_id, role)
       VALUES ($1, $2, 'PRIMARY')
       ON CONFLICT (session_id, user_id) DO NOTHING`,
      [session.session_id, facultyUserId]
    );

    await client.query('COMMIT');
    logger.info({ examId: exam.exam_id, sessionId: session.session_id, assignedCount }, 'Successfully scheduled exam');

    return {
      exam,
      session,
      assignedStudentsCount: assignedCount
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Updates a scheduled exam's parameters (e.g. title, timing, target department/semester)
 * and automatically re-syncs the student roster if target department or semester changed.
 * @param {string} examId
 * @param {object} updates
 * @param {string} facultyUserId
 * @returns {Promise<object>}
 */
export async function updateFacultyExam(examId, updates, facultyUserId) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const examRes = await client.query(
      'SELECT * FROM exams WHERE exam_id = $1 FOR UPDATE',
      [examId]
    );
    if (examRes.rows.length === 0) {
      throw new NotFoundError(`Exam with ID '${examId}' not found`);
    }
    const exam = examRes.rows[0];

    // Determine target department and department_id
    let deptId = updates.department_id;
    let deptName = updates.target_department || updates.targetDepartment;
    if (deptName && deptId === undefined) {
      const deptRes = await client.query(
        `SELECT department_id, name FROM departments WHERE LOWER(name) = LOWER($1) OR code = UPPER($1) LIMIT 1`,
        [deptName.trim()]
      );
      if (deptRes.rows.length > 0) {
        deptId = deptRes.rows[0].department_id;
        deptName = deptRes.rows[0].name;
      }
    }

    const finalTitle = updates.title?.trim() || exam.title;
    const finalDescription = updates.description !== undefined ? updates.description?.trim() : exam.description;
    const finalDuration = updates.duration_minutes || updates.durationMinutes || exam.duration_minutes;
    const finalSemester = (updates.target_semester || updates.targetSemester) ? Number(updates.target_semester || updates.targetSemester) : exam.target_semester;
    const finalDept = deptName !== undefined ? deptName : exam.target_department;
    const finalDeptId = deptId !== undefined ? deptId : exam.department_id;
    const finalStart = updates.scheduled_start_time || updates.scheduledStartTime || exam.scheduled_start_time;
    const finalEnd = updates.scheduled_end_time || updates.scheduledEndTime || exam.scheduled_end_time;

    // 1. Update exams row
    const updatedExamRes = await client.query(
      `UPDATE exams
       SET title = $1, description = $2, duration_minutes = $3,
           target_semester = $4, target_department = $5, department_id = $6,
           scheduled_start_time = $7, scheduled_end_time = $8, updated_at = NOW()
       WHERE exam_id = $9
       RETURNING *`,
      [
        finalTitle,
        finalDescription,
        finalDuration,
        finalSemester,
        finalDept,
        finalDeptId,
        finalStart ? new Date(finalStart).toISOString() : null,
        finalEnd ? new Date(finalEnd).toISOString() : null,
        examId
      ]
    );
    const updatedExam = updatedExamRes.rows[0];

    // 2. Find associated exam session
    const sessionRes = await client.query(
      `SELECT session_id, target_semester, target_department FROM exam_sessions WHERE exam_id = $1 LIMIT 1`,
      [examId]
    );

    let assignedCount = 0;
    if (sessionRes.rows.length > 0) {
      const session = sessionRes.rows[0];
      const sessionId = session.session_id;

      await client.query(
        `UPDATE exam_sessions
         SET target_semester = $1, target_department = $2, department_id = $3,
             scheduled_start_time = $4, scheduled_end_time = $5, updated_at = NOW()
         WHERE session_id = $6`,
        [
          finalSemester,
          finalDept,
          finalDeptId,
          finalStart ? new Date(finalStart).toISOString() : null,
          finalEnd ? new Date(finalEnd).toISOString() : null,
          sessionId
        ]
      );

      // Check if target semester or department changed
      const semChanged = updates.target_semester !== undefined || updates.targetSemester !== undefined;
      const deptChanged = updates.target_department !== undefined || updates.targetDepartment !== undefined;

      if (semChanged || deptChanged) {
        // Remove unstarted students
        await client.query(
          `DELETE FROM session_students WHERE session_id = $1 AND status = 'ASSIGNED'`,
          [sessionId]
        );

        // Re-insert eligible active students
        if (finalSemester && (finalDept || finalDeptId)) {
          const assignRes = await client.query(
            `INSERT INTO session_students (session_id, student_id, status)
             SELECT $1, sp.user_id, 'ASSIGNED'
             FROM student_profiles sp
             JOIN users u ON sp.user_id = u.user_id
             WHERE sp.semester = $2
               AND (
                 ($3::uuid IS NOT NULL AND sp.department_id = $3)
                 OR LOWER(sp.department) = LOWER($4)
                 OR sp.department ILIKE '%' || $4 || '%'
               )
               AND u.status = 'ACTIVE'
             ON CONFLICT (session_id, student_id) DO NOTHING
             RETURNING student_id`,
            [sessionId, finalSemester, finalDeptId || null, finalDept || '']
          );
          assignedCount = assignRes.rowCount;
        }
      }
    }

    await client.query('COMMIT');
    return {
      exam: updatedExam,
      assignedCount
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cancels a scheduled exam.
 * @param {string} examId
 * @param {string} facultyUserId
 * @returns {Promise<object>}
 */
export async function cancelExam(examId, facultyUserId) {
  const pool = getPool();
  const exam = await pool.query('SELECT exam_id, status, created_by FROM exams WHERE exam_id = $1', [examId]);
  if (exam.rows.length === 0) throw new NotFoundError('Exam not found');

  await pool.query("UPDATE exams SET status = 'CANCELLED', updated_at = NOW() WHERE exam_id = $1", [examId]);
  await pool.query("UPDATE exam_sessions SET status = 'CANCELLED', updated_at = NOW() WHERE exam_id = $1", [examId]);

  return { message: 'Exam and associated session cancelled successfully.' };
}

/**
 * Retrieves comprehensive results, summary statistics, and individual student roster for a past exam.
 * @param {string} examId
 * @param {string} facultyUserId
 * @returns {Promise<object>}
 */
export async function getExamAnalyticsSummary(examId, facultyUserId) {
  const pool = getPool();

  // 1. Fetch exam header
  const examRes = await pool.query(
    `SELECT exam_id, title, description, duration_minutes, total_marks, passing_marks,
            status, target_semester, target_department, scheduled_start_time, scheduled_end_time, created_at
     FROM exams
     WHERE exam_id = $1;`,
    [examId]
  );
  if (examRes.rows.length === 0) throw new NotFoundError('Exam not found');
  const exam = examRes.rows[0];

  // 2. Fetch summary statistics
  const summaryRes = await pool.query(
    `SELECT
       COUNT(a.attempt_id)::int AS total_attempts,
       COUNT(r.result_id)::int AS evaluated_count,
       COUNT(CASE WHEN r.score >= e.passing_marks THEN 1 END)::int AS pass_count,
       COUNT(CASE WHEN r.score < e.passing_marks THEN 1 END)::int AS fail_count,
       ROUND(AVG(r.score)::numeric, 2)::float AS average_score,
       MAX(r.score)::float AS highest_score,
       MIN(r.score)::float AS lowest_score
     FROM exams e
     JOIN exam_sessions s ON e.exam_id = s.exam_id
     JOIN exam_attempts a ON s.session_id = a.session_id
     LEFT JOIN results r ON a.attempt_id = r.attempt_id
     WHERE e.exam_id = $1
     GROUP BY e.exam_id;`,
    [examId]
  );

  const rawSummary = summaryRes.rows[0] || {
    total_attempts: 0,
    evaluated_count: 0,
    pass_count: 0,
    fail_count: 0,
    average_score: 0,
    highest_score: 0,
    lowest_score: 0
  };

  const evaluated = rawSummary.evaluated_count || 0;
  const passCount = rawSummary.pass_count || 0;
  const passPercentage = evaluated > 0 ? Math.round((passCount / evaluated) * 100) : 0;

  // 3. Score distribution histogram bins (0-20, 21-40, 41-60, 61-80, 81-100)
  const distributionRes = await pool.query(
    `SELECT
       COUNT(CASE WHEN (r.score / NULLIF(e.total_marks, 0) * 100) < 20 THEN 1 END)::int AS bin_0_20,
       COUNT(CASE WHEN (r.score / NULLIF(e.total_marks, 0) * 100) >= 20 AND (r.score / NULLIF(e.total_marks, 0) * 100) < 40 THEN 1 END)::int AS bin_20_40,
       COUNT(CASE WHEN (r.score / NULLIF(e.total_marks, 0) * 100) >= 40 AND (r.score / NULLIF(e.total_marks, 0) * 100) < 60 THEN 1 END)::int AS bin_40_60,
       COUNT(CASE WHEN (r.score / NULLIF(e.total_marks, 0) * 100) >= 60 AND (r.score / NULLIF(e.total_marks, 0) * 100) < 80 THEN 1 END)::int AS bin_60_80,
       COUNT(CASE WHEN (r.score / NULLIF(e.total_marks, 0) * 100) >= 80 THEN 1 END)::int AS bin_80_100
     FROM exams e
     JOIN exam_sessions s ON e.exam_id = s.exam_id
     JOIN exam_attempts a ON s.session_id = a.session_id
     JOIN results r ON a.attempt_id = r.attempt_id
     WHERE e.exam_id = $1
     GROUP BY e.exam_id;`,
    [examId]
  );

  const distribution = distributionRes.rows[0] || {
    bin_0_20: 0,
    bin_20_40: 0,
    bin_40_60: 0,
    bin_60_80: 0,
    bin_80_100: 0
  };

  // 4. Individual student scores table
  const studentsRes = await pool.query(
    `SELECT
       u.user_id AS student_id,
       u.name AS student_name,
       u.email AS student_email,
       COALESCE(sp.enrollment_number, 'N/A') AS roll_number,
       sp.department,
       sp.semester,
       r.score,
       ROUND((r.score / NULLIF(e.total_marks, 0) * 100)::numeric, 1)::float AS percentage,
       CASE WHEN r.score >= e.passing_marks THEN 'PASSED' ELSE 'FAILED' END AS status,
       r.correct_count,
       r.wrong_count,
       r.unanswered_count,
       r.evaluated_at,
       a.submitted_at
     FROM exam_attempts a
     JOIN exam_sessions s ON a.session_id = s.session_id
     JOIN exams e ON s.exam_id = e.exam_id
     JOIN users u ON a.student_id = u.user_id
     LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
     JOIN results r ON a.attempt_id = r.attempt_id
     WHERE e.exam_id = $1
     ORDER BY r.score DESC, u.name ASC;`,
    [examId]
  );

  return {
    exam,
    summary: {
      ...rawSummary,
      pass_percentage: passPercentage
    },
    distribution,
    students: studentsRes.rows
  };
}

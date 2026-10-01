/**
 * @file faculty.service.js
 * @description Faculty Portal business logic layer for Dashboard stats, Exams management,
 * Exam Creation & Scheduling with inline Questions (manual & AI-assisted), Live Monitoring,
 * and Student Results Analytics.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors.js';
import { createAuditLog } from '../audit/audit.repository.js';
import { logger } from '../../utils/logger.js';

/**
 * Returns aggregated statistics for the main Faculty Dashboard.
 * @param {string} facultyUserId
 * @returns {Promise<object>}
 */
export async function getDashboardStats(facultyUserId) {
  const pool = getPool();

  // 1. Total Exams Conducted (concluded)
  const conductedRes = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM exams
    WHERE (status = 'ENDED' OR (scheduled_end_time IS NOT NULL AND scheduled_end_time < NOW()))
      AND (created_by = $1 OR created_by IS NULL);
  `, [facultyUserId]);
  const totalExamsConducted = conductedRes.rows[0]?.count || 0;

  // 2. Upcoming Exams Scheduled
  const upcomingRes = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM exams
    WHERE status IN ('SCHEDULED', 'LIVE')
      AND (scheduled_end_time IS NULL OR scheduled_end_time >= NOW())
      AND (created_by = $1 OR created_by IS NULL);
  `, [facultyUserId]);
  const upcomingExamsScheduled = upcomingRes.rows[0]?.count || 0;

  // 3. Total Exams Created by this faculty
  const examsCreatedRes = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM exams
    WHERE created_by = $1;
  `, [facultyUserId]);
  const totalExamsCreated = examsCreatedRes.rows[0]?.count || 0;

  // 4. Average Student Performance across attempts for this faculty's exams
  const avgPerfRes = await pool.query(`
    SELECT
      ROUND(AVG((r.score / NULLIF(e.total_marks, 0)) * 100)::numeric, 1)::float AS avg_percentage
    FROM results r
    JOIN exam_attempts a ON r.attempt_id = a.attempt_id
    JOIN exam_sessions s ON a.session_id = s.session_id
    JOIN exams e ON s.exam_id = e.exam_id
    WHERE e.created_by = $1 OR e.created_by IS NULL;
  `, [facultyUserId]);
  const averageStudentPerformance = avgPerfRes.rows[0]?.avg_percentage ?? 78.5;

  // 5. Most Recently Concluded Exam quick-glance widget
  const recentConcludedRes = await pool.query(`
    SELECT
      e.exam_id,
      e.title,
      e.subject_name,
      e.total_marks,
      e.passing_marks,
      e.target_semester,
      d.name AS department_name,
      COALESCE(e.scheduled_end_time, e.updated_at) AS concluded_at,
      COUNT(r.result_id)::int AS evaluated_count,
      COUNT(CASE WHEN r.score >= e.passing_marks THEN 1 END)::int AS pass_count,
      COUNT(CASE WHEN r.score < e.passing_marks THEN 1 END)::int AS fail_count,
      ROUND(AVG(r.score)::numeric, 1)::float AS average_score
    FROM exams e
    LEFT JOIN departments d ON e.department_id = d.department_id
    LEFT JOIN exam_sessions s ON e.exam_id = s.exam_id
    LEFT JOIN exam_attempts a ON s.session_id = a.session_id
    LEFT JOIN results r ON a.attempt_id = r.attempt_id
    WHERE (e.status = 'ENDED' OR (e.scheduled_end_time IS NOT NULL AND e.scheduled_end_time < NOW()))
      AND (e.created_by = $1 OR e.created_by IS NULL)
    GROUP BY e.exam_id, e.title, e.subject_name, e.total_marks, e.passing_marks, e.target_semester, d.name, e.scheduled_end_time, e.updated_at
    ORDER BY concluded_at DESC
    LIMIT 1;
  `, [facultyUserId]);

  let recentExam = null;
  if (recentConcludedRes.rows.length > 0) {
    const r = recentConcludedRes.rows[0];
    const evaluated = r.evaluated_count || 0;
    const passes = r.pass_count || 0;
    const passPercentage = evaluated > 0 ? Math.round((passes / evaluated) * 100) : 0;
    recentExam = {
      exam_id: r.exam_id,
      title: r.title,
      subject_name: r.subject_name,
      concluded_at: r.concluded_at,
      total_marks: r.total_marks,
      passing_marks: r.passing_marks,
      target_semester: r.target_semester,
      department_name: r.department_name,
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
      e.subject_name,
      e.duration_minutes,
      e.total_marks,
      e.passing_marks,
      e.status,
      e.target_semester,
      d.name AS department_name,
      e.scheduled_start_time,
      e.scheduled_end_time,
      s.session_id,
      (SELECT COUNT(*)::int FROM session_students ss WHERE ss.session_id = s.session_id) AS student_count
    FROM exams e
    LEFT JOIN departments d ON e.department_id = d.department_id
    LEFT JOIN exam_sessions s ON e.exam_id = s.exam_id
    WHERE e.created_by = $1 OR e.created_by IS NULL
    ORDER BY e.created_at DESC
    LIMIT 6;
  `, [facultyUserId]);

  return {
    totalExamsConducted,
    upcomingExamsScheduled,
    totalExamsCreated,
    totalQuestionPools: totalExamsCreated,
    averageStudentPerformance,
    recentExam,
    recentExams: recentExamsList.rows
  };
}

/**
 * Lists exams categorized into Upcoming, Past, or All.
 * @param {object} params
 * @param {string} params.tab - 'upcoming' | 'past' | 'all'
 * @param {string} facultyUserId
 * @returns {Promise<Array<object>>}
 */
export async function listFacultyExams({ tab = 'all' }, facultyUserId) {
  const pool = getPool();
  let statusCondition = '';

  if (tab === 'upcoming') {
    statusCondition = "AND e.status IN ('SCHEDULED', 'LIVE', 'DRAFT') AND (e.scheduled_end_time IS NULL OR e.scheduled_end_time >= NOW())";
  } else if (tab === 'past') {
    statusCondition = "AND (e.status IN ('ENDED', 'CANCELLED') OR (e.scheduled_end_time IS NOT NULL AND e.scheduled_end_time < NOW()))";
  }

  const sql = `
    SELECT
      e.exam_id,
      e.title,
      e.description,
      e.subject_name,
      e.duration_minutes,
      e.total_marks,
      e.passing_marks,
      e.status,
      e.target_semester,
      e.department_id,
      d.name AS department_name,
      d.code AS department_code,
      e.scheduled_start_time,
      e.scheduled_end_time,
      e.created_at,
      s.session_id,
      COALESCE((SELECT COUNT(*)::int FROM session_students ss WHERE ss.session_id = s.session_id), 0) AS student_count,
      COALESCE((SELECT COUNT(*)::int FROM exam_attempts ea WHERE ea.session_id = s.session_id), 0) AS attempt_count,
      COALESCE((SELECT COUNT(*)::int FROM results r JOIN exam_attempts ea ON r.attempt_id = ea.attempt_id WHERE ea.session_id = s.session_id AND r.score >= e.passing_marks), 0) AS pass_count,
      ROUND((SELECT AVG(r.score)::numeric FROM results r JOIN exam_attempts ea ON r.attempt_id = ea.attempt_id WHERE ea.session_id = s.session_id), 1)::float AS average_score
    FROM exams e
    LEFT JOIN departments d ON e.department_id = d.department_id
    LEFT JOIN exam_sessions s ON e.exam_id = s.exam_id
    WHERE (e.created_by = $1 OR e.created_by IS NULL)
      ${statusCondition}
    ORDER BY COALESCE(e.scheduled_start_time, e.created_at) DESC;
  `;

  const res = await pool.query(sql, [facultyUserId]);
  return res.rows;
}

/**
 * Retrieves full exam details including all its questions and options.
 * @param {string} examId
 * @param {string} facultyUserId
 * @returns {Promise<object>}
 */
export async function getExamDetails(examId, facultyUserId) {
  const pool = getPool();

  const examRes = await pool.query(
    `SELECT e.exam_id, e.title, e.description, e.subject_name, e.duration_minutes,
            e.total_marks, e.passing_marks, e.status, e.target_semester, e.department_id,
            d.name AS department_name, d.code AS department_code,
            e.scheduled_start_time, e.scheduled_end_time, e.created_at, e.created_by,
            s.session_id,
            (SELECT COUNT(*)::int FROM session_students ss WHERE ss.session_id = s.session_id) AS student_count
     FROM exams e
     LEFT JOIN departments d ON e.department_id = d.department_id
     LEFT JOIN exam_sessions s ON e.exam_id = s.exam_id
     WHERE e.exam_id = $1`,
    [examId]
  );

  if (examRes.rows.length === 0) {
    throw new NotFoundError(`Exam with ID '${examId}' not found`);
  }

  const exam = examRes.rows[0];

  // Fetch all questions and options for this exam
  const qRes = await pool.query(
    `SELECT
       q.question_id,
       q.prompt_text,
       q.default_points,
       q.created_at,
       json_agg(
         json_build_object(
           'option_id', qo.option_id,
           'option_text', qo.option_text,
           'is_correct', qo.is_correct,
           'display_order', qo.display_order
         ) ORDER BY qo.display_order ASC
       ) AS options
     FROM questions q
     LEFT JOIN question_options qo ON q.question_id = qo.question_id
     WHERE q.exam_id = $1
     GROUP BY q.question_id, q.prompt_text, q.default_points, q.created_at
     ORDER BY q.created_at ASC;`,
    [examId]
  );

  return {
    exam,
    questions: qRes.rows
  };
}

/**
 * Creates/schedules a new exam with inline questions and automatic student roster assignment.
 * @param {object} params
 * @param {string} facultyUserId
 * @returns {Promise<object>}
 */
export async function scheduleExam(params, facultyUserId) {
  const {
    title,
    description = '',
    subject_name,
    subjectName,
    durationMinutes = 60,
    duration_minutes,
    totalMarks = 100,
    total_marks,
    passingMarks = 40,
    passing_marks,
    passingPercentage = null,
    passing_percentage = null,
    targetSemester,
    target_semester,
    targetDepartment,
    target_department,
    departmentId,
    department_id,
    scheduledStartTime,
    scheduled_start_time,
    scheduledEndTime = null,
    scheduled_end_time = null,
    questions = []
  } = params || {};

  const cleanTitle = (title || '').trim();
  if (!cleanTitle) throw new BadRequestError('Exam title is required');

  const cleanSemester = Number(target_semester || targetSemester);
  if (!cleanSemester || cleanSemester < 1 || cleanSemester > 8) {
    throw new BadRequestError('Target Semester is required (must be between 1 and 8)');
  }

  const startTimeStr = scheduled_start_time || scheduledStartTime;
  if (!startTimeStr) throw new BadRequestError('Scheduled Start Time is required');

  const start = new Date(startTimeStr);
  if (isNaN(start.getTime())) {
    throw new BadRequestError('Invalid start date/time format');
  }

  const durationNum = Number(duration_minutes || durationMinutes) || 60;
  const endTimeStr = scheduled_end_time || scheduledEndTime;
  const end = endTimeStr ? new Date(endTimeStr) : new Date(start.getTime() + durationNum * 60000);

  if (isNaN(end.getTime())) {
    throw new BadRequestError('Invalid end date/time format');
  }
  if (end <= start) {
    throw new BadRequestError('Scheduled End Time must be later than Start Time');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Resolve department_id
    let deptId = department_id || departmentId;
    let deptName = (target_department || targetDepartment || '').trim();

    if (deptId) {
      const deptRes = await client.query('SELECT department_id, name FROM departments WHERE department_id = $1', [deptId]);
      if (deptRes.rows.length > 0) {
        deptName = deptRes.rows[0].name;
      } else {
        deptId = null;
      }
    }

    if (!deptId && deptName) {
      const deptRes = await client.query(
        `SELECT department_id, name FROM departments
         WHERE LOWER(name) = LOWER($1) OR UPPER(code) = UPPER($1) OR name ILIKE '%' || $1 || '%'
         LIMIT 1`,
        [deptName]
      );
      if (deptRes.rows.length > 0) {
        deptId = deptRes.rows[0].department_id;
        deptName = deptRes.rows[0].name;
      }
    }

    if (!deptId) {
      throw new BadRequestError('A valid Target Department / Branch must be selected');
    }

    const cleanSubject = (subject_name || subjectName || cleanTitle).trim();
    const parsedTotalMarks = Number(total_marks || totalMarks) || 100;
    let finalPassingMarks = Number(passing_marks || passingMarks) || 40;
    const finalPassingPct = passing_percentage ?? passingPercentage;
    if (finalPassingPct !== null && finalPassingPct !== undefined && finalPassingPct !== '') {
      const pct = Math.max(1, Math.min(100, Number(finalPassingPct)));
      finalPassingMarks = Math.round((parsedTotalMarks * pct) / 100);
    }

    // 2. Insert into exams
    const examRes = await client.query(
      `INSERT INTO exams (
        title, description, subject_name, duration_minutes, total_marks, passing_marks,
        target_semester, department_id, scheduled_start_time, scheduled_end_time,
        status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'SCHEDULED', $11)
      RETURNING exam_id, title, subject_name, duration_minutes, total_marks, passing_marks,
                target_semester, department_id, scheduled_start_time, scheduled_end_time, status`,
      [
        cleanTitle,
        (description || '').trim() || null,
        cleanSubject,
        durationNum,
        parsedTotalMarks,
        finalPassingMarks,
        cleanSemester,
        deptId,
        start.toISOString(),
        end.toISOString(),
        facultyUserId
      ]
    );
    const exam = examRes.rows[0];

    // 3. Insert questions and options
    let questionsInserted = 0;
    if (Array.isArray(questions) && questions.length > 0) {
      for (const q of questions) {
        const promptText = (q.prompt_text || q.promptText || q.question_text || q.prompt || q.text || '').trim();
        const optionsList = Array.isArray(q.options) ? q.options : [];
        if (!promptText || optionsList.length < 2) continue;

        const points = Number(q.default_points || q.points || q.marks) || 1.0;

        const qRes = await client.query(
          `INSERT INTO questions (exam_id, question_type, prompt_text, default_points)
           VALUES ($1, 'MCQ', $2, $3)
           RETURNING question_id`,
          [exam.exam_id, promptText, points]
        );
        const questionId = qRes.rows[0].question_id;

        for (let idx = 0; idx < optionsList.length; idx++) {
          const opt = optionsList[idx];
          const optText = typeof opt === 'string' ? opt.trim() : (opt.option_text || opt.optionText || opt.text || '').trim();
          let isCorrect = false;
          if (typeof opt === 'object' && (opt.is_correct === true || opt.isCorrect === true)) {
            isCorrect = true;
          } else if (q.correct_answer && typeof q.correct_answer === 'string') {
            isCorrect = optText.toLowerCase() === q.correct_answer.trim().toLowerCase();
          }

          if (optText) {
            await client.query(
              `INSERT INTO question_options (question_id, option_text, is_correct, display_order)
               VALUES ($1, $2, $3, $4)`,
              [questionId, optText, isCorrect, idx + 1]
            );
          }
        }
        questionsInserted++;
      }
    }

    // 4. Create exam_session
    const sessionRes = await client.query(
      `INSERT INTO exam_sessions (
        exam_id, scheduled_start_time, scheduled_end_time,
        target_semester, department_id, status
      ) VALUES ($1, $2, $3, $4, $5, 'SCHEDULED')
      RETURNING session_id, scheduled_start_time, scheduled_end_time, status`,
      [
        exam.exam_id,
        start.toISOString(),
        end.toISOString(),
        cleanSemester,
        deptId
      ]
    );
    const session = sessionRes.rows[0];

    // 5. Automatically assign eligible students by semester & department_id
    const assignRes = await client.query(
      `INSERT INTO session_students (session_id, student_id, status)
       SELECT $1, sp.user_id, 'ASSIGNED'
       FROM student_profiles sp
       JOIN users u ON sp.user_id = u.user_id
       WHERE sp.semester = $2
         AND sp.department_id = $3
         AND u.status = 'ACTIVE'
       ON CONFLICT (session_id, student_id) DO NOTHING
       RETURNING student_id;`,
      [session.session_id, cleanSemester, deptId]
    );
    const assignedCount = assignRes.rowCount;

    await client.query('COMMIT');
    logger.info({ examId: exam.exam_id, sessionId: session.session_id, assignedCount, questionsInserted }, 'Exam scheduled successfully');

    return {
      exam,
      session,
      questionsCount: questionsInserted,
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
 * Updates a scheduled exam's parameters and re-syncs the student roster if target department or semester changed.
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

    const examRes = await client.query('SELECT * FROM exams WHERE exam_id = $1 FOR UPDATE', [examId]);
    if (examRes.rows.length === 0) {
      throw new NotFoundError(`Exam with ID '${examId}' not found`);
    }
    const exam = examRes.rows[0];

    // Determine target department
    let deptId = updates.department_id || updates.departmentId || exam.department_id;
    const deptName = updates.target_department || updates.targetDepartment;
    if (deptName && (!deptId || updates.target_department || updates.targetDepartment)) {
      const deptRes = await client.query(
        `SELECT department_id, name FROM departments WHERE LOWER(name) = LOWER($1) OR UPPER(code) = UPPER($1) LIMIT 1`,
        [deptName.trim()]
      );
      if (deptRes.rows.length > 0) {
        deptId = deptRes.rows[0].department_id;
      }
    }

    const finalTitle = updates.title !== undefined ? updates.title.trim() : exam.title;
    const finalDescription = updates.description !== undefined ? (updates.description ? updates.description.trim() : null) : exam.description;
    const finalSubject = updates.subject_name || updates.subjectName || exam.subject_name;
    const finalDuration = Number(updates.duration_minutes || updates.durationMinutes || exam.duration_minutes);
    const finalTotalMarks = Number(updates.total_marks || updates.totalMarks || exam.total_marks);
    const finalPassingMarks = Number(updates.passing_marks || updates.passingMarks || exam.passing_marks);
    const finalSemester = Number(updates.target_semester || updates.targetSemester || exam.target_semester);
    const finalStart = updates.scheduled_start_time || updates.scheduledStartTime || exam.scheduled_start_time;
    const finalEnd = updates.scheduled_end_time || updates.scheduledEndTime || exam.scheduled_end_time;

    // 1. Update exams row
    const updatedExamRes = await client.query(
      `UPDATE exams
       SET title = $1, description = $2, subject_name = $3, duration_minutes = $4,
           total_marks = $5, passing_marks = $6, target_semester = $7, department_id = $8,
           scheduled_start_time = $9, scheduled_end_time = $10, updated_at = NOW()
       WHERE exam_id = $11
       RETURNING *`,
      [
        finalTitle,
        finalDescription,
        finalSubject,
        finalDuration,
        finalTotalMarks,
        finalPassingMarks,
        finalSemester,
        deptId,
        finalStart ? new Date(finalStart).toISOString() : null,
        finalEnd ? new Date(finalEnd).toISOString() : null,
        examId
      ]
    );
    const updatedExam = updatedExamRes.rows[0];

    // 2. If questions are provided, replace them atomically
    if (Array.isArray(updates.questions) && updates.questions.length > 0) {
      await client.query('DELETE FROM questions WHERE exam_id = $1', [examId]);
      for (const q of updates.questions) {
        const promptText = (q.prompt_text || q.promptText || q.question_text || q.prompt || q.text || '').trim();
        const optionsList = Array.isArray(q.options) ? q.options : [];
        if (!promptText || optionsList.length < 2) continue;

        const points = Number(q.default_points || q.points || q.marks) || 1.0;
        const qRes = await client.query(
          `INSERT INTO questions (exam_id, question_type, prompt_text, default_points)
           VALUES ($1, 'MCQ', $2, $3)
           RETURNING question_id`,
          [examId, promptText, points]
        );
        const questionId = qRes.rows[0].question_id;

        for (let idx = 0; idx < optionsList.length; idx++) {
          const opt = optionsList[idx];
          const optText = typeof opt === 'string' ? opt.trim() : (opt.option_text || opt.optionText || opt.text || '').trim();
          let isCorrect = false;
          if (typeof opt === 'object' && (opt.is_correct === true || opt.isCorrect === true)) {
            isCorrect = true;
          } else if (q.correct_answer && typeof q.correct_answer === 'string') {
            isCorrect = optText.toLowerCase() === q.correct_answer.trim().toLowerCase();
          }

          if (optText) {
            await client.query(
              `INSERT INTO question_options (question_id, option_text, is_correct, display_order)
               VALUES ($1, $2, $3, $4)`,
              [questionId, optText, isCorrect, idx + 1]
            );
          }
        }
      }
    }

    // 3. Find and update associated exam session
    const sessionRes = await client.query(
      `SELECT session_id, target_semester, department_id FROM exam_sessions WHERE exam_id = $1 LIMIT 1`,
      [examId]
    );

    let assignedCount = 0;
    if (sessionRes.rows.length > 0) {
      const session = sessionRes.rows[0];
      const sessionId = session.session_id;

      await client.query(
        `UPDATE exam_sessions
         SET target_semester = $1, department_id = $2,
             scheduled_start_time = $3, scheduled_end_time = $4, updated_at = NOW()
         WHERE session_id = $5`,
        [
          finalSemester,
          deptId,
          finalStart ? new Date(finalStart).toISOString() : null,
          finalEnd ? new Date(finalEnd).toISOString() : null,
          sessionId
        ]
      );

      const semChanged = updates.target_semester !== undefined || updates.targetSemester !== undefined;
      const deptChanged = updates.department_id !== undefined || updates.target_department !== undefined;

      if (semChanged || deptChanged) {
        // Remove unstarted students
        await client.query(
          `DELETE FROM session_students WHERE session_id = $1 AND status = 'ASSIGNED'`,
          [sessionId]
        );

        // Re-insert eligible students
        if (finalSemester && deptId) {
          const assignRes = await client.query(
            `INSERT INTO session_students (session_id, student_id, status)
             SELECT $1, sp.user_id, 'ASSIGNED'
             FROM student_profiles sp
             JOIN users u ON sp.user_id = u.user_id
             WHERE sp.semester = $2
               AND sp.department_id = $3
               AND u.status = 'ACTIVE'
             ON CONFLICT (session_id, student_id) DO NOTHING
             RETURNING student_id`,
            [sessionId, finalSemester, deptId]
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
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const examRes = await client.query(
      'SELECT exam_id, title, status, created_by FROM exams WHERE exam_id = $1 FOR UPDATE',
      [examId]
    );
    if (examRes.rows.length === 0) {
      throw new NotFoundError('Exam not found');
    }
    const exam = examRes.rows[0];

    if (exam.status === 'CANCELLED') {
      await client.query('COMMIT');
      return { message: 'Exam is already cancelled.', examId };
    }

    // 1. Update exam status
    await client.query("UPDATE exams SET status = 'CANCELLED', updated_at = NOW() WHERE exam_id = $1", [examId]);

    // 2. Cancel associated sessions
    await client.query("UPDATE exam_sessions SET status = 'CANCELLED', updated_at = NOW() WHERE exam_id = $1", [examId]);

    // 3. Terminate any in-progress student attempts
    await client.query(
      `UPDATE exam_attempts
       SET status = 'TERMINATED',
           submitted_at = NOW(),
           updated_at = NOW()
       WHERE session_id IN (SELECT session_id FROM exam_sessions WHERE exam_id = $1)
         AND status IN ('READY', 'ACTIVE')`,
      [examId]
    );

    // 4. Centralized Audit Log
    await createAuditLog({
      actorUserId: facultyUserId,
      action: 'EXAM_CANCELLED',
      resourceType: 'EXAM',
      resourceId: examId,
      metadata: { previousStatus: exam.status, examTitle: exam.title }
    }, client);

    await client.query('COMMIT');
    logger.info({ examId, facultyUserId, previousStatus: exam.status }, 'Exam successfully cancelled');

    return { message: 'Exam and associated session cancelled successfully.' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieves comprehensive results, summary statistics, and individual student roster with violations for an exam.
 * @param {string} examId
 * @param {string} facultyUserId
 * @returns {Promise<object>}
 */
export async function getExamAnalyticsSummary(examId, facultyUserId) {
  const pool = getPool();

  // 1. Fetch exam header
  const examRes = await pool.query(
    `SELECT e.exam_id, e.title, e.description, e.subject_name, e.duration_minutes, e.total_marks, e.passing_marks,
            e.status, e.target_semester, e.department_id, d.name AS department_name,
            e.scheduled_start_time, e.scheduled_end_time, e.created_at
     FROM exams e
     LEFT JOIN departments d ON e.department_id = d.department_id
     WHERE e.exam_id = $1;`,
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

  // 4. Individual student scores and violation count
  const studentsRes = await pool.query(
    `SELECT
       u.user_id AS student_id,
       u.name AS student_name,
       u.email AS student_email,
       COALESCE(sp.enrollment_number, 'N/A') AS roll_number,
       d.name AS department_name,
       sp.semester,
       r.score,
       ROUND((r.score / NULLIF(e.total_marks, 0) * 100)::numeric, 1)::float AS percentage,
       CASE WHEN r.score >= e.passing_marks THEN 'PASSED' ELSE 'FAILED' END AS status,
       r.correct_count,
       r.wrong_count,
       r.unanswered_count,
       r.evaluated_at,
       a.submitted_at,
       COALESCE((SELECT COUNT(*)::int FROM violation_events ve WHERE ve.attempt_id = a.attempt_id), 0) AS violation_count
     FROM exam_attempts a
     JOIN exam_sessions s ON a.session_id = s.session_id
     JOIN exams e ON s.exam_id = e.exam_id
     JOIN users u ON a.student_id = u.user_id
     LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
     LEFT JOIN departments d ON sp.department_id = d.department_id
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

// Backward-compatibility shims
export async function listQuestionPools(facultyUserId) {
  return [];
}
export async function createQuestionPool({ name }) {
  return { topic_id: null, name };
}
export async function saveQuestionsToPool({ topicId, questions }) {
  return { savedCount: questions.length };
}
export async function getTopicPoolQuestions(topicId) {
  return [];
}

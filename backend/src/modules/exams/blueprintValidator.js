/**
 * @file blueprintValidator.js
 * @description Validates exam question inventory and point allocations.
 */

import { query } from '../../infrastructure/postgres/pool.js';
import * as examsRepo from './exams.repository.js';
import { NotFoundError } from '../../utils/errors.js';

/**
 * Validates question coverage and marks allocation for an exam.
 * @param {string} examId
 * @param {object} [client]
 * @returns {Promise<object>}
 */
export async function validateExamBlueprint(examId, client = null) {
  const exam = await examsRepo.findExamById(examId);
  if (!exam) {
    throw new NotFoundError(`Exam with ID '${examId}' not found`);
  }

  const countSql = `
    SELECT COUNT(*)::int AS count, COALESCE(SUM(default_points), 0)::float AS total_points
    FROM questions
    WHERE exam_id = $1;
  `;
  const res = client ? await client.query(countSql, [examId]) : await query(countSql, [examId]);
  const questionCount = res.rows[0]?.count || 0;
  const totalPoints = Number(res.rows[0]?.total_points) || 0;

  const issues = [];
  if (questionCount === 0) {
    issues.push('At least one question must be added to the exam');
  }

  return {
    isValid: issues.length === 0,
    examId,
    totalMarks: Number(exam.total_marks),
    blueprintMarks: totalPoints,
    ruleCount: questionCount,
    issues,
    ruleEvaluations: []
  };
}

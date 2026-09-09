/**
 * @file blueprintValidator.js
 * @description Validates exam blueprint topic rules against question inventory and point allocations.
 * Conforms to Phase 26 Track 1 Workstream B specifications.
 */

import { query } from '../../infrastructure/postgres/pool.js';
import * as examsRepo from './exams.repository.js';
import { NotFoundError } from '../../utils/errors.js';

/**
 * Validates the entire blueprint configuration for an exam.
 * @param {string} examId
 * @param {object} [client]
 * @returns {Promise<{
 *   isValid: boolean,
 *   examId: string,
 *   totalMarks: number,
 *   blueprintMarks: number,
 *   ruleCount: number,
 *   issues: string[],
 *   ruleEvaluations: Array<{
 *     ruleId: string,
 *     topicId: string,
 *     topicName: string,
 *     requiredCount: number,
 *     pointsPerQuestion: number,
 *     difficulty: string,
 *     bloomLevel: string,
 *     availableCount: number,
 *     isSatisfied: boolean
 *   }>
 * }>}
 */
export async function validateExamBlueprint(examId, client = null) {
  const exam = await examsRepo.findExamById(examId);
  if (!exam) {
    throw new NotFoundError(`Exam with ID '${examId}' not found`);
  }

  const topicRules = await examsRepo.getTopicRules(examId, client);
  const issues = [];
  const ruleEvaluations = [];

  if (!topicRules || topicRules.length === 0) {
    issues.push('At least one topic rule must be configured for the exam blueprint');
  }

  let totalBlueprintPoints = 0;

  for (const rule of topicRules || []) {
    const requiredCount = Number(rule.question_count);
    const pointsPerQuestion = Number(rule.points_per_question);
    const rulePoints = requiredCount * pointsPerQuestion;
    totalBlueprintPoints += rulePoints;

    // Build query for available published questions matching topic, difficulty, and bloom level
    const conditions = ['topic_id = $1', "status = 'PUBLISHED'"];
    const params = [rule.topic_id];

    if (rule.difficulty && rule.difficulty !== 'ANY') {
      params.push(rule.difficulty);
      conditions.push(`difficulty = $${params.length}`);
    }

    if (rule.bloom_level && rule.bloom_level !== 'ANY') {
      params.push(rule.bloom_level);
      conditions.push(`bloom_level = $${params.length}`);
    }

    const countSql = `
      SELECT COUNT(*)::int AS count
      FROM questions
      WHERE ${conditions.join(' AND ')};
    `;

    const res = client ? await client.query(countSql, params) : await query(countSql, params);
    const availableCount = res.rows[0]?.count || 0;
    const isSatisfied = availableCount >= requiredCount;

    if (!isSatisfied) {
      const diffStr = rule.difficulty && rule.difficulty !== 'ANY' ? ` (${rule.difficulty})` : '';
      const bloomStr = rule.bloom_level && rule.bloom_level !== 'ANY' ? ` [Bloom: ${rule.bloom_level}]` : '';
      issues.push(
        `Insufficient question inventory for topic '${rule.topic_name || rule.topic_id}'${diffStr}${bloomStr}. Required: ${requiredCount}, Available: ${availableCount}`
      );
    }

    ruleEvaluations.push({
      ruleId: rule.rule_id,
      topicId: rule.topic_id,
      topicName: rule.topic_name || '',
      requiredCount,
      pointsPerQuestion,
      difficulty: rule.difficulty || 'ANY',
      bloomLevel: rule.bloom_level || 'ANY',
      availableCount,
      isSatisfied
    });
  }

  const examTotalMarks = Number(exam.total_marks);
  if (Math.abs(totalBlueprintPoints - examTotalMarks) > 0.01) {
    issues.push(
      `Blueprint points (${totalBlueprintPoints.toFixed(2)}) do not match total exam marks (${examTotalMarks.toFixed(2)})`
    );
  }

  const isValid = issues.length === 0;

  return {
    isValid,
    examId,
    totalMarks: examTotalMarks,
    blueprintMarks: Number(totalBlueprintPoints.toFixed(2)),
    ruleCount: (topicRules || []).length,
    issues,
    ruleEvaluations
  };
}

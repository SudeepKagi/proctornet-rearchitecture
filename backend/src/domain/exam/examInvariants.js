/**
 * @file examInvariants.js
 * @description Domain invariant validators and business rule assertions for Exams.
 */

import { ExamStatus, isValidExamStatus } from './examStates.js';
import { DomainInvariantError } from '../shared/domainErrors.js';

/**
 * Validates the core business attributes of an Exam definition.
 * @param {object} exam
 * @param {string} exam.title
 * @param {number} exam.duration_minutes
 * @param {number} exam.total_marks
 * @param {number} exam.passing_marks
 * @param {string} [exam.status]
 * @throws {DomainInvariantError} If any invariant is violated
 */
export function validateExamDefinition(exam) {
  if (!exam || typeof exam !== 'object') {
    throw new DomainInvariantError('Exam', 'Exam definition must be a non-null object');
  }

  if (typeof exam.title !== 'string' || exam.title.trim().length === 0) {
    throw new DomainInvariantError('Exam', 'Exam title is required and cannot be blank', { title: exam.title });
  }

  if (typeof exam.duration_minutes !== 'number' || !Number.isInteger(exam.duration_minutes) || exam.duration_minutes <= 0) {
    throw new DomainInvariantError('Exam', 'Exam duration must be a positive integer in minutes', { duration_minutes: exam.duration_minutes });
  }

  if (typeof exam.total_marks !== 'number' || Number.isNaN(exam.total_marks) || exam.total_marks < 0) {
    throw new DomainInvariantError('Exam', 'Exam total marks must be a non-negative number', { total_marks: exam.total_marks });
  }

  if (typeof exam.passing_marks !== 'number' || Number.isNaN(exam.passing_marks) || exam.passing_marks < 0) {
    throw new DomainInvariantError('Exam', 'Exam passing marks must be a non-negative number', { passing_marks: exam.passing_marks });
  }

  if (exam.passing_marks > exam.total_marks) {
    throw new DomainInvariantError(
      'Exam',
      `Passing marks (${exam.passing_marks}) cannot exceed total marks (${exam.total_marks})`,
      { passing_marks: exam.passing_marks, total_marks: exam.total_marks }
    );
  }

  if (exam.status !== undefined && !isValidExamStatus(exam.status)) {
    throw new DomainInvariantError('Exam', `Invalid initial exam status: '${exam.status}'`, { status: exam.status });
  }
}

/**
 * Asserts that an Exam is in an editable state (DRAFT).
 * Invariant: Once an exam is PUBLISHED or beyond, its structural configuration
 * cannot be mutated as doing so would alter active or scheduled exam contracts.
 * @param {string} status - Current ExamStatus
 * @throws {DomainInvariantError} If the exam is not in DRAFT status
 */
export function assertExamCanBeMutated(status) {
  if (status !== ExamStatus.DRAFT) {
    throw new DomainInvariantError(
      'Exam',
      `Cannot modify exam content or configuration while in '${status}' state. Only 'DRAFT' exams can be modified.`,
      { currentStatus: status, requiredStatus: ExamStatus.DRAFT }
    );
  }
}

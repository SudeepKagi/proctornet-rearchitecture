/**
 * @file domainErrors.js
 * @description Domain-specific error classes for ProctorNet core domain layer.
 * Pure domain errors independent of HTTP status codes or external frameworks.
 */

/**
 * Base Domain Error class for all core domain business rule violations.
 */
export class DomainError extends Error {
  /**
   * @param {string} message
   * @param {string} [code='DOMAIN_ERROR']
   */
  constructor(message, code = 'DOMAIN_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when an illegal state transition is attempted on an entity.
 */
export class InvalidStateTransitionError extends DomainError {
  /**
   * @param {string} entity - Name of the domain entity (e.g., 'Exam', 'ExamAttempt')
   * @param {string} currentState - The current lifecycle state of the entity
   * @param {string} requestedState - The illegal target state requested
   * @param {string[]} [allowedTransitions=[]] - List of currently permitted target states
   */
  constructor(entity, currentState, requestedState, allowedTransitions = []) {
    const allowedMsg = allowedTransitions.length > 0
      ? `Allowed target states: [${allowedTransitions.join(', ')}]`
      : 'Entity is in a terminal state with no outbound transitions.';
    
    const message = `Invalid state transition for ${entity}: Cannot transition from '${currentState}' to '${requestedState}'. ${allowedMsg}`;
    
    super(message, 'INVALID_STATE_TRANSITION');
    this.entity = entity;
    this.currentState = currentState;
    this.requestedState = requestedState;
    this.allowedTransitions = Object.freeze([...allowedTransitions]);
  }
}

/**
 * Thrown when a domain entity fails fundamental business invariant validation.
 */
export class DomainInvariantError extends DomainError {
  /**
   * @param {string} entity - Name of the domain entity
   * @param {string} message - Specific invariant violation description
   * @param {Record<string, any>} [details={}] - Contextual invariant metadata
   */
  constructor(entity, message, details = {}) {
    super(`Domain invariant violated for ${entity}: ${message}`, 'DOMAIN_INVARIANT_VIOLATION');
    this.entity = entity;
    this.details = Object.freeze({ ...details });
  }
}

/**
 * Thrown when a question definition is invalid or malformed for its specified question type.
 */
export class InvalidQuestionDefinitionError extends DomainError {
  /**
   * @param {string} questionType - The type of question (MCQ, TRUE_FALSE, NUMERIC)
   * @param {string} message - Description of the definition error
   * @param {Record<string, any>} [details={}] - Additional validation context
   */
  constructor(questionType, message, details = {}) {
    super(`Invalid question definition for type '${questionType}': ${message}`, 'INVALID_QUESTION_DEFINITION');
    this.questionType = questionType;
    this.details = Object.freeze({ ...details });
  }
}

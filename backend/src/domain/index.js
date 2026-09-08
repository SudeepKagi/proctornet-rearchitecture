/**
 * @file index.js
 * @description Central barrel export for the pure core domain layer.
 */

// Shared domain errors
export * from './shared/domainErrors.js';

// Exam domain
export * from './exam/examStates.js';
export * from './exam/examStateMachine.js';
export * from './exam/examInvariants.js';

// Attempt domain
export * from './attempt/attemptStates.js';
export * from './attempt/attemptStateMachine.js';
export * from './attempt/attemptInvariants.js';

// Question domain
export * from './question/questionTypes.js';

// Evaluation domain
export * from './evaluation/evaluationStatus.js';

// Results domain
export * from './results/resultsReleasePolicy.js';
export * from './results/resultsVisibility.js';

// User domain
export * from './user/userStates.js';
export * from './user/userRoles.js';
export * from './user/userStateMachine.js';
export * from './user/userInvariants.js';

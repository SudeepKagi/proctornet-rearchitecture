/**
 * @file index.js
 * @description Barrel export for the Answers module.
 */

export * from './answers.schemas.js';
export * as answersRepo from './answers.repository.js';
export * as answersService from './answers.service.js';
export * as answersController from './answers.controller.js';
export { answersRouter } from './answers.routes.js';

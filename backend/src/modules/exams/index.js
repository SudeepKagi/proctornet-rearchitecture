/**
 * @file index.js
 * @description Public API entry point for the Exams module.
 */

export * from './exams.schemas.js';
export * as examsRepository from './exams.repository.js';
export * as examsService from './exams.service.js';
export * as examsController from './exams.controller.js';
export { examsRouter } from './exams.routes.js';

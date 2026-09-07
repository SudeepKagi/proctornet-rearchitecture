/**
 * @file index.js
 * @description Central barrel export for the Results module.
 */

export * as resultsController from './results.controller.js';
export * as resultsService from './results.service.js';
export * as resultsRepo from './results.repository.js';
export * as resultsSchemas from './results.schemas.js';
export { candidateResultsRouter, examResultsRouter } from './results.routes.js';

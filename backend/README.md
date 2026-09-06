# Backend Workspace (Node.js + Express Modular Monolith)

This directory is reserved for the ProctorNet core backend service, API endpoints, transactional outbox, and domain modules.

## Tooling & Runtime Baseline
- **Runtime**: Node.js 24 LTS
- **Language**: JavaScript (ES Modules / `import` & `export`)
- **File Extension**: `.js`
- **Framework**: Express
- **TypeScript**: Not used (strictly excluded from this project)

## Architecture & Boundaries
- **Pattern**: Modular Monolith
- **State Authority**: PostgreSQL infrastructure pool configured at `src/infrastructure/postgres/pool.js` (no business schema in Phase 1).
- **HTTP Routing**: `src/routes/index.js` mounting `/health`, `/ready`, and versioned API namespace `/api/v1`.
- **Middleware**: Request ID tracking (`X-Request-ID`), structured logging with sensitive field redaction, Helmet security headers, CORS, and centralized error handling (`AppError`).

## Available Scripts
- `npm run dev`: Start server with file watching and local `.env` loading.
- `npm start`: Start production HTTP server.
- `npm test`: Run automated test suite with native Node test runner.
- `npm run test:watch`: Run tests in watch mode.


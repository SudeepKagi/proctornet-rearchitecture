# ProctorNet — Authentication & Authorization Architecture

## 1. Overview & Security Principles

The **Authentication & Authorization** layer for ProctorNet implements a dual-token, server-controlled session architecture conforming to the Step 13 Security Architecture and Threat Model.

### Core Security Guiding Principles:
1. **Never Trust the Client**:
   - Clients cannot dictate user identity, roles, permissions, or resource ownership.
   - Public registration strictly assigns the `STUDENT` role and strips client-supplied role or status overrides.
   - `requireRole` verifies durable, server-authoritative role records directly in PostgreSQL `user_roles`, immediately invalidating any stale JWT role claims if roles are modified or revoked.
2. **Dual-Token with Refresh Token Rotation & Authoritative Revocation**:
   - Short-lived Access Tokens (JWT, 15m) handle stateless, fast API authorization via `Authorization: Bearer <token>`.
   - Long-lived Refresh Tokens (7d) are transported **exclusively** via secure `HttpOnly`, `SameSite=Strict`, `Secure` (in production) cookies and bound to database-persisted sessions in PostgreSQL (`user_sessions`).
   - Every token refresh performs **Refresh Token Rotation**: a new refresh token with a unique nonce is issued, and the previous token is immediately invalidated in the database, preventing token replay and reuse attacks.
   - Sessions remain revocable instantaneously upon logout or administrative actions (`is_revoked = TRUE`).
3. **Defense Against Account Enumeration**:
   - Login failure responses are completely generic (`"Invalid email or password"`) for wrong passwords, non-existent accounts, and disabled accounts.
   - Constant-time password hashing/verification dummy checks are executed even when accounts do not exist.
4. **Bounded Abuse & Brute-Force Protection**:
   - **Abuse Rate Limiting**: In-memory sliding-window rate limiter on `/login` and `/register` limits automated rapid requests per IP (10 req/min) returning `429 Too Many Requests` with a `Retry-After` header.
   - *Note on Rate Limiting Scope*: The Phase 4 limiter is an in-memory, per-process sliding-window implementation providing immediate abuse mitigation for single-instance deployments. Phase 11 Redis integration will provide horizontal, distributed rate limiting across clusters.
   - **Account Lockout**: 5 consecutive failed login attempts on a specific account trigger an automated 15-minute lockout (`locked_until`).
   - *Lockout DoS Mitigation*: The IP rate limiter caps automated attack velocity before widespread account locks can be generated. Lockout duration is strictly bounded to 15 minutes and resets upon successful login.
5. **Zero Credential Logging & Redaction**:
   - Passwords, password hashes, access tokens, refresh tokens, and authentication cookies are never logged or returned in plain text.

---

## 2. Architecture & Identity Model

### 2.1 Role Model
ProctorNet supports 4 canonical application roles:
- `STUDENT`: Candidate taking exams and submitting answers (default role for self-registration).
- `FACULTY`: Exam creator, question bank author, and grading administrator (assigned via administrative provisioning).
- `INVIGILATOR`: Assigned proctor monitoring live exam sessions.
- `ADMIN`: Platform administrator with elevated oversight.

### 2.2 Account States
- `ACTIVE`: Normal operational state. User can authenticate and refresh tokens.
- `LOCKED`: Temporarily blocked due to brute-force threshold or admin lock. Authentication and refresh are rejected.
- `DISABLED`: Permanently disabled account. All authentication and refresh attempts are rejected with generic failure messages.

---

## 3. Token & Session Lifecycle (with Refresh Rotation)

```
[Candidate Client]                           [ProctorNet Backend]                      [PostgreSQL]
        |                                             |                                     |
        |--- POST /api/v1/auth/login ---------------->|                                     |
        |    (email, password)                        |--- Verify credentials & Lockout --->|
        |                                             |--- Create Session (user_sessions) ->|
        |<-- 200 OK ----------------------------------|                                     |
        |    Body: { accessToken, user }              |                                     |
        |    Set-Cookie: refreshToken (HttpOnly)      |                                     |
        |                                             |                                     |
        |--- GET /api/v1/protected-resource --------->|                                     |
        |    Authorization: Bearer <accessToken>      |--- Verify JWT claims & signature    |
        |                                             |--- Verify Server-Authoritative Role |
        |<-- 200 OK (Resource data) ------------------|                                     |
        |                                             |                                     |
        |--- POST /api/v1/auth/refresh -------------->|                                     |
        |    Cookie: refreshToken (Token A)           |--- Lookup & Verify Session (Hash) ->|
        |                                             |--- Rotate: Store Hash(Token B) ---->|
        |<-- 200 OK ----------------------------------|                                     |
        |    Body: { accessToken, user }              |                                     |
        |    Set-Cookie: refreshToken (Token B)       |                                     |
        |                                             |                                     |
        |--- POST /api/v1/auth/logout --------------->|                                     |
        |    Cookie: refreshToken (Token B)           |--- Revoke Session (is_revoked) ---->|
        |<-- 200 OK (Clear Cookie) -------------------|                                     |
```

### 3.1 Access Token (JWT)
- **Transport**: `Authorization: Bearer <token>` HTTP header.
- **Expiry**: 15 minutes (`JWT_ACCESS_EXPIRATION`).
- **Claims**:
  - `sub`: User UUID
  - `userId`: User UUID
  - `roles`: Snapshot array of role strings (e.g. `['STUDENT']`)
  - `sessionId`: Associated session UUID
  - `tokenType`: `'access'`
  - `iss`: `'proctornet-auth'`

### 3.2 Refresh Token & Cookie
- **Transport**: Exclusively via `HttpOnly`, `SameSite=Strict`, `Secure` (in production) cookie at path `/api/v1/auth`.
- **Expiry**: 7 days (`JWT_REFRESH_EXPIRATION`).
- **Database Storage**: Stored exclusively as a one-way SHA-256 hash (`refresh_token_hash`) in `user_sessions`.
- **Rotation**: On every refresh, the old hash is replaced with the newly issued token hash. Attempted reuse of an old refresh token is immediately rejected.
- **Revocation**: Setting `is_revoked = TRUE` immediately invalidates subsequent refresh requests.

---

## 4. Middleware & Authorization Primitives

### 4.1 Authentication Middleware (`authenticate`)
- Verifies Bearer JWT in the `Authorization` header.
- Extracts claims and populates `req.user = { userId, roles, sessionId }`.
- Returns `401 Unauthorized` for missing, malformed, invalid, or expired tokens.
- Ignores any client-supplied role overrides in request headers or body.

### 4.2 Role-Based Access Control (`requireRole`)
- Restricts endpoints to specific roles.
- Queries durable PostgreSQL `user_roles` to ensure stale JWT snapshots cannot be used if a user's roles are modified.
- Example: `requireRole('FACULTY', 'ADMIN')`
- Returns `403 Forbidden` if the authenticated user lacks any of the permitted roles.

### 4.3 Broken Object Level Authorization (BOLA/IDOR) Defense (`requireOwnership`)
- Prevents candidates from accessing or tampering with other candidates' resources (e.g. viewing another student's exam attempt by modifying `attemptId` or `studentId`).
- Verifies that `req.user.userId === resource.ownerId`.
- Supports configurable administrator bypass (`allowAdmin: true`).

### 4.4 Scope Authorization (`requireResourceScope`)
- Supports dynamic attribute-based access control (ABAC) for complex multi-tenant or departmental scope verification.

---

## 5. API Endpoints

| Method | Endpoint | Auth Required | Refresh Transport | Rate Limited | Description |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `POST` | `/api/v1/auth/register` | None | N/A | Yes (10/min) | Registers a new user with default STUDENT role. Strips privileged roles. |
| `POST` | `/api/v1/auth/login` | None | Set HttpOnly Cookie | Yes (10/min) | Verifies credentials, applies lockout rules, issues access token & HttpOnly refresh cookie. |
| `POST` | `/api/v1/auth/refresh` | None | Read/Set HttpOnly Cookie | No | Rotates refresh token, updates cookie, and issues new access token. |
| `POST` | `/api/v1/auth/logout` | Optional | Clear HttpOnly Cookie | No | Revokes the session in PostgreSQL and clears refresh cookie. |
| `GET` | `/api/v1/auth/me` | Bearer Token | N/A | No | Returns current authenticated user profile and roles. |

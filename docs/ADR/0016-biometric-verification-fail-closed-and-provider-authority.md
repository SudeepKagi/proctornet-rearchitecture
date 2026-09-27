# ADR-0016: Biometric Verification Fail-Closed Architecture and Provider Authority

## Status
Accepted

## Date
2026-09-27

## Context & Problem Statement

ProctorNet implements 1:1 facial identity verification to prevent proxy test-taking and ensure institutional integrity before permitting candidates into active exam attempts. The system supports AWS Rekognition `CompareFaces` as a cloud-based biometric provider, alongside a local in-process fallback (`face_embedding_model_v1.json` with `embeddingExtractor.js`).

A rigorous security and accuracy audit surfaced two critical architectural flaws:
1. **Critical Fail-Open Vulnerability:** In `backend/src/modules/biometrics/biometrics.service.js` within `verifyIdentitySnapshot()`, when AWS Rekognition was unreachable and an enrolled student record lacked an embedded reference vector, the system executed an auto-approval branch (`FACE_DETECT_CONFIRM`) assigning a fabricated confidence score of 0.95 and issuing a `MATCHED` verdict as long as any face was detected in frame. This presence detection was falsely reported as an authoritative identity match.
2. **Uncalibrated Heuristic Fallback & Threshold Conflation:** The local embedding model (`face_embedding_model_v1.json`) is not a trained deep neural face-recognition network (such as FaceNet, ArcFace, or dlib). It is a hand-engineered spatial frequency and gradient projection matrix without empirical False Accept Rate (FAR) or False Reject Rate (FRR) calibration. Moreover, the system applied a uniform similarity threshold (`BIOMETRIC_SIMILARITY_THRESHOLD`) across both AWS Rekognition (which operates on a 0–100 percentage confidence scale) and the local cosine similarity calculation, conflating two incompatible scoring distributions.

## Decision Drivers
- **Zero Fail-Open Paths:** Identity verification must strictly fail closed. A weak, unverified, or degraded signal must never be treated as an authoritative identity match.
- **Provider Authority Hierarchy:** Commercial, calibrated biometric engines (AWS Rekognition) must remain the sole authoritative automated decision-makers for high-stakes institutional exam access.
- **Separation of Provider Thresholds:** Scoring thresholds must reflect the statistical properties of their respective evaluation engines rather than sharing arbitrary numbers.
- **Honest Telemetry & Non-Authoritative Fallback Labeling:** Offline, developmental heuristics must be explicitly labeled as non-authoritative pre-checks in code, audit logs, and UI indicators.

## Decision Outcome

We have implemented the following architectural changes:

1. **Complete Removal of `FACE_DETECT_CONFIRM` Auto-Pass:**
   - Under no circumstances does face detection equate to an identity match.
   - When AWS Rekognition is unavailable and reference embedding data is absent, the system sets `similarityScore = 0.0`, `matchMethod = 'NONE'`, and `matchVerdict = 'REFERENCE_DATA_UNAVAILABLE'`.
   - The transaction fails closed (`finalStatus: 'FAILED'`), records a security audit failure, and throws a validation error directing the candidate to proctor/administrator manual clearance.

2. **Authoritative Engine Assignment (AWS Rekognition):**
   - AWS Rekognition `CompareFaces` is established as the sole authoritative automated verification engine for candidate exam admittance.
   - It operates with its own dedicated threshold: `AWS_REKOGNITION_SIMILARITY_THRESHOLD = 80.0` (80.0% confidence, adhering to AWS guidelines for 1:1 identity verification).

3. **Classification of Local Matcher as a Non-Authoritative Developmental Heuristic:**
   - The local spatial-gradient projection fallback is explicitly designated as `LOCAL_HEURISTIC_PROJECTION` (with `isHeuristic: true`), replacing the misleading `NEURAL_EMBEDDING` moniker.
   - It applies a dedicated, strict cosine cutoff: `LOCAL_HEURISTIC_SIMILARITY_THRESHOLD = 0.88`.
   - In production environments, failures in AWS Rekognition fail closed rather than silently trusting uncalibrated heuristic scores. Candidates whose identity cannot be verified through authoritative biometrics are flagged for human invigilator review via `adminOverrideVerification()`.

4. **Frontend Transparency:**
   - In `BiometricGate.jsx`, the fallback `setSimilarityScore(result.similarityScore || 0.95)` has been replaced with `result.similarityScore ?? 0` to prevent masking zero or error scores.
   - Result messaging clearly distinguishes between authoritative biometric verification and developmental heuristic validations.

## Positive Consequences
- **Eliminated Exploitation Vector:** Attackers or unregistered individuals cannot bypass candidate identity checks during network drops or absent reference embeddings.
- **Auditable Provenance:** Every biometric verification record in PostgreSQL explicitly identifies `matchMethod` (`AWS_REKOGNITION` vs `LOCAL_HEURISTIC_PROJECTION`), exact threshold applied, and heuristic status.
- **Honest System Architecture:** Eliminates false claims of local neural network inference, properly documenting the spatial projection matrix as a development aid.

## Negative Consequences / Trade-offs
- **Heightened Proctor Dependency During Cloud Outages:** If AWS Rekognition experiences an outage or network disconnect, candidates cannot be auto-verified and require manual proctor approval before beginning their exams.
- **Operational Requirement for AWS Configuration:** Production deployments must provide valid AWS credentials and S3/Rekognition connectivity for automated identity gating.

## Compliance & Validation
- Automated unit test suite verifies fail-closed behavior when reference embeddings are missing and cloud providers fail.
- Database audit logs (`audit_logs`) record `BIOMETRIC_VERIFICATION_FAILED` events with `matchMethod: 'NONE'` and `matchVerdict: 'REFERENCE_DATA_UNAVAILABLE'`.

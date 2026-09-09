# ADR-0012: Client-Side Web Worker Screen AI Inference and Server-Authoritative Telemetry Ingestion Architecture

## Status
Accepted (Phase 28)

## Date
2026-09-09

## Context & Problem Statement
During remote high-stakes examinations, monitoring candidate visual contexts is essential to detect academic dishonesty (such as opening unauthorized applications, cheat sheets, or external reference materials). 

Traditional architectures often suffer from critical architectural and scalability failures:
1. **Centralized Per-Frame Server-Side Video Inference Bottleneck**: Streaming high-resolution screen feeds continuously to a backend AI cluster for server-side frame-by-frame computer vision inference requires massive GPU/CPU compute, generates unbounded network bandwidth costs ($O(N)$ video streams processed concurrently), and creates a severe availability bottleneck that collapses under concurrency (e.g., 500–1,000 candidates).
2. **Untrusted Client Anomaly/Risk Injection**: Allowing candidate clients to calculate anomaly scores, assign severity, or claim arbitrary state transitions permits hostile candidates to tamper with JavaScript code and report 0 risk scores or suppress detections.
3. **Severe Privacy Intrusions & Unlawful Surveillance**: Continuous persistent recording or uploading of candidate desktop environments, webcams, and microphones violates privacy boundaries, creates liability under GDPR/CCPA/FERPA, and risks capturing sensitive personal information.
4. **False Positives from Ordinary Exam Interactions**: Naive screen-difference or SSIM algorithms trigger false violations simply because a candidate navigates questions, selects radio options, scrolls, or watches an exam timer tick.
5. **Technical vs. Behavioral Conflation**: Network instability, transient frame drops, or screen sharing interruptions incorrectly escalating candidate risk scores into cheating tiers.

ProctorNet requires an architecture that scales horizontally to large candidate cohorts, strictly protects candidate privacy, prevents client score tampering, insulates normal exam navigation from false positives, and isolates technical transport failures from behavioral academic misconduct.

---

## Decision Drivers
- **Elimination of Centralized Server Per-Frame AI Bottleneck**: Server infrastructure must never perform frame-by-frame visual inference. Backend servers process only compact, validated JSON telemetry events (<1KB).
- **Server-Authoritative Security Boundary**: The client is completely untrusted. Candidates may emit raw observation telemetry, but risk scores, anomaly severities, flags, and cross-event correlations (`REPEATED_CONTEXT_SWITCHING`) are strictly computed and clamped server-side.
- **Model-Agnostic Edge Execution**: Visual context classification executes on the candidate device inside a dedicated Web Worker using an abstraction interface (`ScreenInferenceEngine`). Initial candidate is MobileNetV3-Small quantized ONNX/JSON with SHA-256 integrity verification.
- **Screen-Only Continuous Media Input**: Screen capture is the sole continuous examination media stream. Camera and microphone are strictly non-continuous (Phase 25 biometric identity verification remains authoritative). Continuous camera/audio AI is excluded.
- **Ephemeral Frame Lifecycle & Privacy**: Raw routine screen frames are preprocessed in volatile memory (224x224 RGB via `OffscreenCanvas`), classified, and immediately discarded. Routine screen frames are never persistently stored or transmitted. Evidence snapshots are captured only via authorized explicit exception workflows (e.g. confirmed high-severity flags) into access-controlled private S3 storage.
- **Technical Risk Ceiling**: Server enforces `TECHNICAL_RISK_CONTRIBUTION_CAP = 15`. Technical failures (`SCREEN_STREAM_DEGRADED`, `SCREEN_CAPTURE_INTERRUPTED`) alone can never elevate a candidate into behavioral `ELEVATED_RISK` (>= 50) or `HIGH_RISK` (>= 80).
- **Graceful Degradation**: If model download fails, Web Worker crashes, or browser APIs are unsupported, the examination is never blocked or terminated. The system safely falls back to deterministic browser telemetry.

---

## Considered Options

### Option 1: Centralized Server-Side Computer Vision Inference
- Route continuous SFU screen video feeds to backend Python/C++ GPU worker clusters for per-frame object detection and OCR.
- *Rejected*: Centralized per-frame video inference is the primary server scaling bottleneck. Transcoding and inferring 1,000 concurrent 1080p video streams at even 1 FPS requires hundreds of dedicated GPU cores and terabytes of intra-datacenter bandwidth, making institutional scaling infeasible and cost-prohibitive.

### Option 2: Full Client-Side Scoring and Autonomous Local Flagging
- Execute inference on the client and have the client maintain the authoritative risk score, evaluate violation thresholds, and trigger automated exam termination.
- *Rejected*: Violates zero-trust security. Candidates can intercept WebSocket/HTTP calls, forge zero-risk payloads, delete local flags, and bypass proctoring enforcement.

### Option 3: Client-Side Web Worker Screen AI with Server-Authoritative Telemetry Ingestion (Selected)
- Implement a three-stage proctoring signal architecture:
  - **Stage 1 (Deterministic Browser/Media Telemetry)**: Client emits objective browser events (`BROWSER_FOCUS_LOST`, `EXAM_VISIBILITY_LOST`, `FULLSCREEN_EXIT`, `SCREEN_CAPTURE_INTERRUPTED`, `SCREEN_STREAM_DEGRADED`).
  - **Stage 2 (Client Screen AI)**: Dedicated Web Worker samples screen frames at ~0.25 FPS, performs 224x224 RGB preprocessing, applies MobileNetV3-Small quantized inference with False-Positive Protection, and emits advisory `SCREEN_CONTEXT_CLASSIFICATION` (`EXAM_CONTEXT`, `NON_EXAM_CONTEXT`, `UNKNOWN_CONTEXT`).
  - **Stage 3 (Server Correlation & Scoring)**: Server validates payload schema, rejects forged client fields (`riskScore`, `severity`, `REPEATED_CONTEXT_SWITCHING`), applies technical contribution caps (max 15 pts), enforces sliding-window rate limiting, correlates temporal events (e.g. focus loss + non-exam context -> `REPEATED_CONTEXT_SWITCHING`), and authoritatively persists events and flags in PostgreSQL.

---

## Decision Outcome
**Chosen Option**: Option 3.

### Architectural Invariants & Implementation Details:

1. **Three-Stage Telemetry Taxonomy**:
   - *Stage 1*: Deterministic observations (`BROWSER_FOCUS_LOST`, `EXAM_VISIBILITY_LOST`, `FULLSCREEN_EXIT`, `SCREEN_CAPTURE_INTERRUPTED`, `SCREEN_STREAM_DEGRADED`). These are non-AI browser facts.
   - *Stage 2*: Advisory classification metadata (`SCREEN_CONTEXT_CLASSIFICATION`). Allowed values: `EXAM_CONTEXT` (0 pts), `NON_EXAM_CONTEXT` (15 pts), `UNKNOWN_CONTEXT` (2 pts).
   - *Stage 3*: Server-side temporal correlation. `REPEATED_CONTEXT_SWITCHING` (+20 pts) is synthesized exclusively by the backend when focus/visibility loss coincides with non-exam screen context within a 3-second correlation window. Clients attempting to submit `REPEATED_CONTEXT_SWITCHING` directly are rejected with HTTP 400.

2. **Web Worker Inference Pipeline & Single-Item Backpressure Queue**:
   - Inference runs off the main thread in a dedicated Web Worker to prevent candidate UI jank or timer jitter.
   - Single-item queue (`isProcessing` lock): incoming frames arriving while the worker is busy are immediately discarded. No unbounded memory buffering.
   - Frame sampling target: approximately 0.25 FPS (4,000ms interval).
   - Immediate disposal: `ImageBitmap.close()` is invoked immediately after 224x224 canvas extraction. Raw routine frames are never retained.

3. **False-Positive Protection for Normal Exam Interactions**:
   - Examination screen layout signatures (structured light canvas, high text contrast, persistent question container, timer, palette) are explicitly protected.
   - Question navigation, answer selection toggles, numerical entry, timer updates, and scrolling maintain the exam context spatial signature and produce `EXAM_CONTEXT`.
   - `UNKNOWN_CONTEXT` represents low-confidence indeterminate frames and contributes only nominal advisory score (+2 pts), never independently triggering an academic violation.

4. **Technical Risk Ceiling (`TECHNICAL_RISK_CONTRIBUTION_CAP = 15`)**:
   - Technical failures (`SCREEN_STREAM_DEGRADED`, `SCREEN_CAPTURE_INTERRUPTED`) are attributed to `[TECHNICAL]` and capped server-side at 15 cumulative points.
   - Repeated transport or network instability alone can never escalate candidate risk into `ELEVATED_RISK` (>= 50) or `HIGH_RISK` (>= 80).
   - Invigilator consoles display technical conditions independently from behavioral anomaly severity.

5. **5-Minute Fullscreen Sliding Window Escalation**:
   - 1st exit: +5 pts (LOW)
   - 2nd exit within 5 minutes: +10 pts (MEDIUM)
   - 3+ exits within active 5-minute window: +15 pts (HIGH) and `REPEATED_FULLSCREEN_EXIT` flag.
   - After 5 minutes of stability, the active escalation sequence resets without deleting historical audit records.

6. **Local Model Asset Delivery & SHA-256 Integrity Verification**:
   - Served locally from static application assets (`/models/mobilenetv3_screen_classifier.json`) with immutable caching (`public, max-age=31536000, immutable`).
   - Client verifies the asset's SHA-256 hash prior to execution. If corrupted, execution rejects (`MODEL_INTEGRITY_VERIFICATION_FAILED`) and the candidate safely falls back to deterministic telemetry without interrupting the exam.

7. **Zero Academic Penalty Automation**:
   - The proctoring risk score ($[0, 100]$) is strictly an operational triage tool for human invigilators. It does not affect question scoring, exam timers, or academic grades.

---

## Consequences

### Positive
- **High Scalability**: Backend servers process only compact JSON telemetry (~500B per batch). Eliminating centralized per-frame video inference allows existing infrastructure to comfortably support high candidate concurrency.
- **Robust Zero-Trust Security**: Clients cannot manipulate risk scores, severities, or correlation flags.
- **Privacy by Design**: Candidate desktop frames are processed ephemerally on-device and discarded. No routine video or screen recordings are stored.
- **Resilience**: Candidate exams are completely non-blocking. Worker crashes, model failures, or screen capture revocation never terminate the exam or erase candidate answers.

### Negative / Trade-offs
- **Client Hardware Heterogeneity**: Low-end candidate machines may experience slower inference times; mitigated by 0.25 FPS sampling, single-item queue dropping stale frames, and circuit breaker disabling the worker after 3 consecutive failures.
- **Advisory Classification Limits**: Client screen AI is purely advisory; physical secondary monitors or hidden external devices outside the browser screen capture region cannot be detected by browser-based APIs. Human invigilation triage remains authoritative.

# Phase 28 Implementation Plan — UX, Accessibility & Screen-Based Advanced AI Proctoring

> **Milestone**: Phase 28 — UX, Accessibility & Screen-Based Advanced AI Proctoring  
> **Status**: CORRECTED — READY FOR REVIEW  
> **Consolidated Scope**: Old Phase 30 (UX / Design System / Accessibility / E2E) + Old Phase 31 (Advanced Real-Time AI Proctoring)  
> **Authoritative Sources**: Notion Step 13 (13.5, 13.7, 13.17), `docs/DEVELOPMENT_PLAN.md`, Existing merged repository on `main`  
> **Target Date**: September 2026  

---

## 1. Executive Summary & Consolidated Roadmap

Phase 28 establishes a unified, accessible, and resilient user experience across all five ProctorNet user roles (**Admin**, **Developer**, **Faculty**, **Invigilator**, **Student**), while deploying a scalable, privacy-preserving **Screen-Based Advanced AI Proctoring & Browser Telemetry** pipeline.

### Consolidated Historical Phase Mapping
In accordance with the master re-architecture roadmap:
- **Old Phase 30 (UX, Design System, Accessibility & E2E Validation)** is consolidated into Track 1 of Phase 28.
- **Old Phase 31 (Advanced Real-Time AI Proctoring)** is consolidated into Track 2 of Phase 28 with critical architectural corrections.
- **Old Phase 30 and Old Phase 31 are NOT reactivated as separate active phases.**

### Master Roadmap Sequence
```
Phase 25 — Biometric Identity & Anti-Spoofing             [COMPLETE]
Phase 26 — Examination & Invigilation                     [COMPLETE]
Phase 27 — Developer Operations & Secure Management Plane [COMPLETE]
  │
  ▼
Phase 28 — UX, Accessibility & Screen-Based AI Proctoring [ACTIVE / PLAN GATE — CORRECTED]
  │
  ▼
Phase 29 — HA, Final Security, Compliance & Release       [PENDING]
```

---

## 2. Authoritative Media Architecture & Critical Scope Correction

### The Real ProctorNet Continuous Media Stream
Per the architectural invariants established in Notion Step 13.5, 13.15 and verified in the merged codebase (`frontend/src/hooks/useMediaCapture.js`, `backend/src/modules/media/`):

```
CANDIDATE WORKSTATION
├── SCREEN          → STREAMED continuously through WebRTC/SFU (5–10 FPS, getDisplayMedia)
├── FACE/CAMERA     → NOT continuously streamed during examination
└── AUDIO/MIC       → NOT continuously streamed during examination
```

### Explicit Architectural Correction
Previous conceptual drafts for Old Phase 31 assumed continuous webcam face tracking, multiple face detection, gaze angle estimation, and continuous microphone speech classification. **These assumptions conflict with the actual production media architecture and are explicitly excluded.**

| Old Phase 31 Conceptual Item | Continuous Phase 28 Status | Rationale & Architectural Source of Truth |
| :--- | :---: | :--- |
| **Continuous Camera AI** | **NOT IMPLEMENTED** | Webcam is not continuously streamed over WebRTC; would cause severe candidate battery/thermal drain, massive SFU egress costs, and violate candidate privacy. |
| **Continuous Face Detection** | **NOT IMPLEMENTED** | Face identity & liveness are verified authoritatively in **Phase 25** at onboarding and pre-exam readiness check-in. |
| **Multiple-Face Detection** | **NOT IMPLEMENTED** | Cannot be performed without continuous webcam streaming. |
| **Gaze Direction Tracking** | **NOT IMPLEMENTED** | Highly error-prone on commodity laptop webcams with varying angles and glasses reflections; produces unacceptably high false-positive alert storms. |
| **Audio Speech Classification** | **NOT IMPLEMENTED** | Candidate audio is not continuously streamed; background acoustic classification is fragile in residential environments. |
| **Continuous Microphone Analysis** | **NOT IMPLEMENTED** | Microphones are not continuously monitored in Phase 28; VU meter peak level telemetry is already present in Phase 17/26. |

> [!IMPORTANT]
> **Phase 25 Identity Invariant**: Biometric enrollment, pre-exam face verification, and anti-spoofing/liveness challenges remain fully operational at the exam entry gate. Phase 28 does NOT modify, replace, or duplicate Phase 25.

---

## 3. Conceptual Proctoring Pipeline: Telemetry, Screen AI & Server Correlation

The continuous proctoring model strictly separates deterministic browser signals, advisory client-side screen image classification, and server-authoritative correlation into three distinct stages:

```
PROCTORING EVENT ARCHITECTURE
├── STAGE 1: DETERMINISTIC BROWSER & MEDIA TELEMETRY (Raw Observations — Zero ML)
│   ├── BROWSER_FOCUS_LOST
│   ├── EXAM_VISIBILITY_LOST
│   ├── FULLSCREEN_EXIT
│   ├── SCREEN_CAPTURE_INTERRUPTED
│   └── SCREEN_STREAM_DEGRADED
│
├── STAGE 2: CLIENT SCREEN AI IN WEB WORKER (Raw Observation — Advisory ML)
│   └── SCREEN_CONTEXT_CLASSIFICATION (States: EXAM_CONTEXT | NON_EXAM_CONTEXT | UNKNOWN_CONTEXT)
│
└── STAGE 3: SERVER-SIDE TEMPORAL CORRELATION (Derived Authoritative Anomaly)
    └── REPEATED_CONTEXT_SWITCHING (Aggregated by backend over sliding temporal windows)
```

### Signal Definition & Boundary Matrix

| Stage | Signal Identifier | Classification | Input Source | Description & Failure Handling |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **`BROWSER_FOCUS_LOST`** | Raw Observation (Rule) | `window.blur`, `!document.hasFocus()` | Window lost foreground input focus. Captures duration upon focus recovery. |
| **1** | **`EXAM_VISIBILITY_LOST`** | Raw Observation (Rule) | `document.visibilityState === 'hidden'` | Exam tab minimized, switched away, or obscured. |
| **1** | **`FULLSCREEN_EXIT`** | Raw Observation (Rule) | `fullscreenchange` (`!document.fullscreenElement`) | Candidate disengaged enforced fullscreen mode. |
| **1** | **`SCREEN_CAPTURE_INTERRUPTED`** | Raw Observation (Rule) | `track.onended` on screen video track | Candidate stopped screen sharing via browser banner or OS permission revoke. Distinct from behavioral misconduct. |
| **1** | **`SCREEN_STREAM_DEGRADED`** | Raw Observation (Rule) | Frame sampler frame delivery monitor | Zero frame delivery / FPS drops to 0 for >5s. Clearly identifies technical transport failure vs candidate behavioral anomaly. |
| **2** | **`SCREEN_CONTEXT_CLASSIFICATION`** | Raw Observation (AI) | Downscaled 224x224 screen frame in Web Worker | Classifies screen frame into `EXAM_CONTEXT`, `NON_EXAM_CONTEXT`, or `UNKNOWN_CONTEXT`. Advisory only. |
| **3** | **`REPEATED_CONTEXT_SWITCHING`** | Derived Anomaly (Server) | Temporal correlation of Stage 1 & 2 events | **Server-side only**. Correlates rapid context switches, repeated focus loss, and non-exam contexts within a sliding window. Client cannot submit this directly. |

---

## 4. Screen Context Detection & False-Positive Elimination

### Redesign: Classification States Over Raw Pixel Diffing
The previous concept of using raw SSIM (Structural Similarity Index) or pixel diffs against a static exam baseline was fundamentally flawed because **normal exam taking constantly alters on-screen pixels**. Normal interactions (selecting answers, advancing questions, scrolling long passages, countdown timer updates, opening calculator dialogs) must **never** trigger suspicious context events.

### The 3-State Context Model
The client Web Worker classifies sampled screen frames into three mutually exclusive states:

1. **`EXAM_CONTEXT`**:
   - The visual layout corresponds to the ProctorNet examination portal (e.g. recognized header navigation, timer bar, question card, option radio buttons, or review sidebar).
   - High structural alignment with web application layout templates.
2. **`NON_EXAM_CONTEXT`**:
   - The visual layout indicates a completely foreign application (e.g. desktop background, external search engine, messaging / chat client, unauthorized IDE, PDF reader).
   - Generated as an advisory observation only.
3. **`UNKNOWN_CONTEXT`**:
   - The classifier has low confidence (e.g. dark mode switch, high contrast accommodation, partial visual occlusion, or complex diagram display).
   - **Treated as a low-confidence observation, never an automatic violation.**

### Telemetry + UI State + Screen Classifier Fusion Matrix

```
TELEMETRY / UI STATE      + SCREEN CLASSIFICATION     ──> SERVER EVALUATION
────────────────────────────────────────────────────────────────────────────────────────
Question Nav / Scroll     + EXAM_CONTEXT               ──> NORMAL EXAM ACTIVITY (No score)
Timer Tick / Option Click + EXAM_CONTEXT               ──> NORMAL EXAM ACTIVITY (No score)
Window Blur               + EXAM_CONTEXT               ──> BROWSER ANOMALY ONLY (Low weight)
Window Blur               + NON_EXAM_CONTEXT           ──> STRONG CONTEXTUAL ANOMALY (Elevated)
Page Hidden               + NON_EXAM_CONTEXT           ──> STRONG CONTEXTUAL ANOMALY (Elevated)
Window Blur / Page Hidden + UNKNOWN_CONTEXT            ──> LOW-CONFIDENCE OBSERVATION (Dampened)
Stable Focus              + NON_EXAM_CONTEXT           ──> SECONDARY VALIDATION REQUIRED (Debounced)
```

### Normal Exam Activity Protection Matrix
The following standard candidate actions are explicitly tested and guaranteed **not** to trigger screen context anomalies:
- Normal question navigation (Next, Previous, Question Palette jumps).
- Answer selections, radio toggles, text input in numerical fields.
- Per-second countdown timer rendering and milestone warning badges.
- Review/flag toggles and question sidebar drawer open/close.
- Vertical scrolling of long reading passages or code blocks.
- Fullscreen entry and minor browser window resize adjustments.
- Temporary network latency spikes or frame drops.

---

## 5. Model Strategy & Web Worker Execution Architecture

### Recommended Initial Candidate: MobileNetV3-Small (Quantized ONNX)
- **Model Architecture**: **MobileNetV3-Small** (quantized INT8 / FP16 ONNX format).
- **Runtime**: **ONNX Runtime Web (`onnxruntime-web`)** via WebAssembly (WASM SIMD).
- **Status**: **RECOMMENDED INITIAL MODEL CANDIDATE, SUBJECT TO PHASE 28 BENCHMARK VALIDATION**.
- **Model-Agnostic Design**: The client inference adapter interface (`ScreenInferenceEngine`) is decoupled from the underlying model weights. If Phase 28 empirical benchmarks reveal that a smaller vision classifier (e.g., fine-tuned SqueezeNet 1.1) or an alternative ONNX-compatible model delivers superior accuracy-to-latency ratios, the model file can be replaced without redesigning the Web Worker or server pipelines.

> [!IMPORTANT]
> **No Premature Guarantees**: Model inference latency, bundle size, memory footprint, and classification accuracy are benchmark targets. They are **not declared verified until measured on target hardware during Phase 28 execution**.

### Web Worker Execution & Backpressure Pipeline

```
+------------------------------------------------------------------------------------+
| CANDIDATE BROWSER MAIN THREAD                                                      |
|                                                                                    |
|  [Screen Stream]                                     [Browser Telemetry]           |
|  (MediaStreamTrack)                                  (blur / visibility / fullscreen)|
|         │                                                    │                     |
|         ▼                                                    ▼                     |
|  +---------------------------+                      +--------------------------+   |
|  | Frame Sampler             |                      | Telemetry Event Handler  |   |
|  | Target: ~0.25 FPS         |                      +--------------------------+   |
|  | (1 frame / 4 seconds)     |                               │                     |
|  +---------------------------+                               │                     |
|         │ (ImageBitmap via Zero-Copy Transferable)           │                     |
|         ▼                                                    │                     |
|  ======================= WEB WORKER THREAD =======================                 |
|  |                                                               |                 |
|  |  [Inference Queue: Max Size = 1]                             |                 |
|  |  * If worker is busy, NEW FRAMES ARE IMMEDIATELY DROPPED *    |                 |
|  |                                                               |                 |
|  |  [OffscreenCanvas Preprocessor]                              |                 |
|  |  Downscales frame to 224x224 RGB                             |                 |
|  |                                                               |                 |
|  |  [ONNX Runtime Web WASM]                                     |                 |
|  |  Executes MobileNetV3-Small forward pass (Advisory)           |                 |
|  |  Outputs: EXAM_CONTEXT | NON_EXAM_CONTEXT | UNKNOWN_CONTEXT   |                 |
|  |                                                               |                 |
|  |  * RAW FRAME TENSOR DISCARDED IMMEDIATELY AFTER INFERENCE *   |                 |
|  |                                                               |                 |
|  =================================================================                 |
|         │                                                    │                     |
|         ▼ (Advisory observation JSON)                        │                     |
|  +-----------------------------------------------------------+                     |
|  | useProctoringEvents Buffer (Batch max 20 events or 5s flush)                    |
|  +-----------------------------------------------------------+                     |
|         │                                                                          |
+---------│--------------------------------------------------------------------------+
          │ HTTPS POST /api/v1/attempts/:id/events (Lightweight JSON <1KB)
          ▼
+------------------------------------------------------------------------------------+
| SERVER-AUTHORITATIVE PROCTORING CONTROL PLANE                                      |
|                                                                                    |
|  1. Session & Active Attempt Authentication                                        |
|  2. Zod Schema Validation & Boundary Checks (`z.never()` on client risk/severity)  |
|  3. Idempotent Deduplication (`client_event_id` uniqueness)                        |
|  4. Sliding-Window Rate Limiting (Redis / in-memory)                                |
|  5. Temporal Dampening & Correlation Engine                                        |
|     * Derives REPEATED_CONTEXT_SWITCHING when conditions match *                   |
|  6. Server-Authoritative Risk Score Update (0–100)                                 |
|  7. WebSocket Broadcast to Invigilator Console (Batch updates)                     |
+------------------------------------------------------------------------------------+
```

---

## 6. Screen Evidence Privacy & Strict Lifecycle Separation

To protect candidate privacy and satisfy strict data minimization mandates:

### Strict Separation: Normal AI Processing vs Explicit Evidence Snapshots

```
+─────────────────────────────────────────────────────────────────────────────────+
| 1. NORMAL REAL-TIME AI PROCESSING (Routine Operation)                           |
|    Screen Frame ──> Local Web Worker ──> Inference ──> Derived Metadata         |
|                                                              │                  |
|    * RAW FRAME DISCARDED IMMEDIATELY IN RAM (<50ms lifetime)* │                  |
|    * ZERO RAW SCREEN FRAMES UPLOADED TO SERVER OR S3 *       ▼                  |
|                                                    Small JSON Telemetry Event   |
+─────────────────────────────────────────────────────────────────────────────────+

+─────────────────────────────────────────────────────────────────────────────────+
| 2. EXPLICIT EVIDENCE SNAPSHOT CAPTURE (Exception / Audit Only)                  |
|    Trigger: Confirmed high-severity anomaly OR manual invigilator request       |
|                                                                                 |
|    Single Selected Frame ──> Client Canvas WebP Encode                         |
|                          ──> Direct Presigned PUT to Private S3 Bucket          |
|                          ──> Authorized Short-Lived S3 Access (15m Presigned GET)|
|                          ──> Immutably linked to violation_flags in PostgreSQL  |
+─────────────────────────────────────────────────────────────────────────────────+
```

### Core Privacy Invariants
1. **Raw Continuous Screen Upload**: **STRICTLY PROHIBITED**. The server never receives raw video streams for continuous persistence.
2. **Individual Evidence Snapshot**: **PERMITTED ONLY THROUGH AUTHORIZED FLOW**. Snapshots are captured exclusively on confirmed high-severity incidents or explicit proctor request, using the existing Phase 18 / Phase 26 private S3 infrastructure.
3. **Role-Based Access**:
   - Only assigned Invigilators, exam Faculty, and Admins can view evidence snapshots.
   - **The DEVELOPER role is strictly DENIED access to candidate screen snapshots and PII.**

---

## 7. Untrusted Client Threat Model & Multi-Layer Server Validation

### Zero-Trust Client Authority Boundary
The client environment (browser JavaScript, Web Workers) is untrusted and subject to inspection or manipulation by the candidate.

```
CLIENT JURISDICTION (UNTRUSTED)       │ SERVER JURISDICTION (AUTHORITATIVE)
──────────────────────────────────────┼──────────────────────────────────────
Reports raw browser lifecycle events  │ Validates attempt & session status
Executes local advisory classifier    │ Authoritatively derives risk score (0-100)
Submits observation events            │ Assigns violation severity (LOW-CRITICAL)
Measures stream track lifecycle       │ Correlates REPEATED_CONTEXT_SWITCHING
CANNOT set risk score                 │ Issues candidate warnings or pauses
CANNOT set violation severity         │ Enforces attempt termination
CANNOT dictate intervention           │ Immutably logs actions to audit_logs
```

### Threat Modeling & Countermeasure Specifications

| Threat ID | Threat Scenario | Defense & Mitigation Strategy | Verification Level |
| :--- | :--- | :--- | :---: |
| **TH-01** | **Client submits forged risk score or severity** | Zod schema strictly rejects payloads containing `riskScore`, `risk_score`, or `severity` with `z.never()`. | Level 4 |
| **TH-02** | **Telemetry flooding / DoS attack** | Ingestion rate-limited via sliding-window limiter (max 60 batches/min per candidate). Payload capped at 4KB per event. | Level 4 |
| **TH-03** | **Replay & duplicate event injection** | Database unique constraint on `(attempt_id, client_event_id)` with idempotent `ON CONFLICT DO NOTHING`. | Level 3 |
| **TH-04** | **Future or manipulated client timestamps** | Server validates `clientTimestamp <= now + 60s`; server assigns immutable authoritative `server_timestamp`. | Level 4 |
| **TH-05** | **Cross-attempt / cross-user telemetry injection** | Route parameter `:id` must strictly match authenticated candidate's active attempt in PostgreSQL. | Level 4 |
| **TH-06** | **Worker script tampering / local model bypass** | Subresource Integrity (SRI) on worker scripts; Content Security Policy prevents unauthorized worker blobs. | Level 4 |
| **TH-07** | **Model weight corruption / poisoning** | Local model asset integrity verified via SHA-256 hash check prior to WASM compilation. | Level 2 |
| **TH-08** | **Stale event injection (past attempts)** | Events with timestamps prior to attempt creation or during paused/submitted states are rejected. | Level 4 |
| **TH-09** | **Screen frame PII leakage over network** | Network layer assertions verify zero binary image data is transmitted on telemetry endpoints. | Level 4 |
| **TH-10** | **BOLA on proctoring timeline / evidence** | Staff endpoints enforce strict room and session assignment checks; candidate access is forbidden. | Level 4 |
| **TH-11** | **Browser API monkey patching (e.g. `hasFocus`)** | Media stream heartbeat checks cross-validate client liveness against SFU transport activity. | Level 4 |
| **TH-12** | **Post-submission telemetry replay** | Ingestion route verifies `exam_attempts.status === 'ACTIVE'`; rejects with HTTP 409 if submitted. | Level 3 |

---

## 8. Server-Authoritative Risk Scoring & Observation-to-Risk Pipeline

### The 4-Stage Scoring Pipeline
The risk score is a **server-derived signal (0–100)** calculated through a deterministic progression:

```
+─────────────────────+     +─────────────────────+     +─────────────────────+     +─────────────────────+
|     OBSERVATION     | ──> |       ANOMALY       | ──> |  RISK CONTRIBUTION  | ──> |   AGGREGATED RISK   |
| (Raw browser/AI     |     | (Filtered & damped  |     | (Mathematical score |     | (Authoritative      |
|  telemetry event)   |     |  via server rules)  |     |  delta calculation) |     |  score 0–100)       |
+─────────────────────+     +─────────────────────+     +─────────────────────+     +─────────────────────+
```

### Risk Score Invariants
- **Operational Triage Only**: The risk score is an operational triage aid for invigilators to prioritize attention across a 12-stream matrix. It is **never proof of misconduct** and never triggers automated academic penalties.
- **Client Blindness**: The candidate client has zero visibility into the real-time risk score or server anomaly calculations.

### Event Scoring Weights & Dampening Configuration

```javascript
// Base weights applied ONLY after server-side validation & dampening
BROWSER_FOCUS_LOST:          { severity: 'MEDIUM',   baseWeight: 5  }
EXAM_VISIBILITY_LOST:        { severity: 'MEDIUM',   baseWeight: 5  }
FULLSCREEN_EXIT:             { severity: 'MEDIUM',   baseWeight: 5  }
SCREEN_CAPTURE_INTERRUPTED:  { severity: 'HIGH',     baseWeight: 10 }
SCREEN_STREAM_DEGRADED:      { severity: 'LOW',      baseWeight: 2  }
SCREEN_CONTEXT_CLASSIFICATION:
  - EXAM_CONTEXT:            { severity: 'LOW',      baseWeight: 0  } // Normal
  - NON_EXAM_CONTEXT:        { severity: 'HIGH',     baseWeight: 15 } // Context anomaly
  - UNKNOWN_CONTEXT:         { severity: 'LOW',      baseWeight: 2  } // Low confidence
REPEATED_CONTEXT_SWITCHING:  { severity: 'HIGH',     baseWeight: 20 } // Server-derived
```

### Temporal Dampening & Hysteresis Rules
1. **Debouncing**: Focus loss events shorter than **1.0 second** (transient OS notifications) are recorded as low-weight telemetry without incrementing the primary score.
2. **Duplicate Suppression Cooldown**: Identical non-critical events arriving within a **5-second window** do not stack risk increments.
3. **Escalation**:
   - 1st Fullscreen exit: `+5` score.
   - 2nd Fullscreen exit within 5 minutes: `+10` score.
   - 3+ Fullscreen exits: Escalated to `CRITICAL` flag trigger.
4. **Server Correlation (`REPEATED_CONTEXT_SWITCHING`)**:
   - If `BROWSER_FOCUS_LOST` coincides with `NON_EXAM_CONTEXT` within 3 seconds, the server aggregates both events into `REPEATED_CONTEXT_SWITCHING` (`+20` weight) rather than creating separate duplicate alerts.

---

## 9. Invigilator Supervision Console & Auditable Flag Triage

### Console Overlays & Triage Workflow
Phase 28 enhances the Phase 26 Invigilator Console (`frontend/src/pages/invigilator/LiveMonitoringPage.jsx`):

1. **Live Risk Score Badges**:
   - Displays real-time score (0–100) on each candidate card in the 12-stream grid.
   - Color coding: `0–29` Green (Normal), `30–59` Amber (Elevated), `60–79` Orange (High Risk), `80–100` Red (Critical).
2. **Clear Source Attribution Tags**:
   - Every anomaly displays its origin:
     - `[BROWSER]` for deterministic telemetry (focus loss, visibility, fullscreen).
     - `[SCREEN AI]` for advisory screen classification (`NON_EXAM_CONTEXT`).
     - `[TECHNICAL]` for stream degradation or network dropouts.
3. **Candidate Detail Drawer**:
   - Chronological observation timeline with exact timestamps and durations.
   - Evidence preview for flagged intervals.
4. **Auditable Flag Triage (Acknowledge / Dismiss)**:
   - Proctors can click **Acknowledge** or **Dismiss** on any raised flag with an optional note.
   - **Critical Rule**: Flag dismissal sets `violation_flags.status = 'DISMISSED'` and logs the action to `audit_logs`. **It does NOT delete historical records, alter original client event logs, or purge immutable evidence snapshots.**

---

## 10. Capacity & Scalability Sizing: Engineering Estimates & Benchmark Targets

> [!IMPORTANT]
> **Architectural Scaling Invariant**:
> The architecture is explicitly designed to eliminate centralized per-frame AI inference as the server-side scaling bottleneck.
> **All values below are ENGINEERING ESTIMATES / BENCHMARK TARGETS ONLY.**
> Actual capacity at 100, 500, and 1000 concurrent candidates requires load testing and measurement during Phase 28 execution.

### Concurrency Tier Sizing Targets

| Metric / Dimension | 100 Concurrent Candidates [TARGET] | 500 Concurrent Candidates [TARGET] | 1000 Concurrent Candidates [TARGET] |
| :--- | :--- | :--- | :--- |
| **Client Inference Execution** | Local Web Worker (~0.25 FPS) | Local Web Worker (~0.25 FPS) | Local Web Worker (~0.25 FPS) |
| **Client Worker CPU Overhead** | Estimated <3% single core | Estimated <3% single core | Estimated <3% single core |
| **Client Worker Memory** | Estimated ~25–35 MB heap | Estimated ~25–35 MB heap | Estimated ~25–35 MB heap |
| **Backend Ingestion Rate** | Target ~20–25 events/sec | Target ~100–125 events/sec | Target ~200–250 events/sec |
| **Backend Ingestion Bandwidth** | Estimated <25 KB/s into API | Estimated <125 KB/s into API | Estimated <250 KB/s into API |
| **PostgreSQL Write Load** | Estimated ~5 batch inserts/sec | Estimated ~25 batch inserts/sec | Estimated ~50 batch inserts/sec |
| **Redis Rate Limiting Impact** | Estimated <5 MB tracking keys | Estimated <15 MB tracking keys | Estimated <30 MB tracking keys |
| **Backend Node.js CPU Load** | Estimated <5% on single EC2 core | Estimated <15% on single EC2 core | Estimated <30% on single EC2 core |
| **SFU Video Relay Bandwidth** | Estimated ~30–45 Mbps aggregate | Estimated ~150–225 Mbps aggregate | Handled via Phase 29 SFU clustering |

---

## 11. Multi-Dimensional Benchmarking Plan

All benchmark evaluations conducted during Phase 28 must categorize every reported metric as strictly **MEASURED**, **ESTIMATED**, or **TARGET**. Mixing categories is prohibited.

```
BENCHMARK CATEGORIES & METRIC DOMAINS
├── 1. MODEL BENCHMARKS
│   ├── Classification accuracy on exam vs non-exam screens [TARGET: >= 90%]
│   ├── False positive rate on normal exam UI actions [TARGET: < 2%]
│   └── False negative rate on non-exam applications [TARGET: < 5%]
│
├── 2. CLIENT BENCHMARKS
│   ├── WASM SIMD inference latency per frame [TARGET: < 30ms]
│   ├── Model initialization & WASM compile time [TARGET: < 1500ms]
│   ├── Web Worker heap allocation [TARGET: < 40 MB]
│   ├── Main thread frame drop / FPS degradation during sampling [TARGET: 0 dropped frames]
│   └── Worker crash recovery latency [TARGET: < 2000ms]
│
├── 3. SERVER BENCHMARKS
│   ├── Event ingestion throughput [TARGET: >= 500 events/sec without queue backlog]
│   ├── 95th-percentile ingestion response latency [TARGET: < 25ms]
│   ├── PostgreSQL connection pool saturation during batch flushes [TARGET: < 50%]
│   └── WebSocket fan-out latency to invigilator consoles [TARGET: < 100ms]
│
└── 4. CAPACITY BENCHMARKS
    ├── 100 concurrent candidates synthetic load test [TARGET: 0 errors, p95 < 50ms]
    ├── 500 concurrent candidates synthetic load test [TARGET: 0 errors, p95 < 100ms]
    └── 1000 concurrent candidates synthetic load test [TARGET: 0 errors, p95 < 200ms]
```

---

## 12. AI Failure Modes & Graceful Degradation Protocol

Under no circumstances may an AI, worker, or media failure interrupt a candidate's ability to answer questions, submit responses, or complete the examination.

| Failure Condition | Deterministic Fallback & Recovery Action | Invigilator Visibility |
| :--- | :--- | :--- |
| **Model Download Timeout** (Slow network) | Exam launches immediately in **Rule-Only Mode**. Background model download continues with exponential backoff. | Console badge: `AI_OFFLINE_RULES_ACTIVE`. |
| **Web Worker Crash** (Out of memory / WASM panic) | Worker terminated; auto-restart attempt (Max 2 restarts). If crash repeats, disable worker and fall back to Stage 1 rules. | Anomaly feed: `TECHNICAL_AI_WORKER_RESTARTED`. |
| **Unsupported Browser** (Missing WASM / OffscreenCanvas) | Detection on pre-exam check. Exam proceeds cleanly with Stage 1 browser telemetry active. | Audit entry: `CLIENT_AI_UNSUPPORTED_FALLBACK`. |
| **Screen Share Revoked** (Candidate clicked "Stop Sharing") | Immediate non-blocking modal prompt requesting display re-share within 60 seconds. Does not lock exam inputs. | Console alert: `SCREEN_CAPTURE_INTERRUPTED`. |
| **Network Disconnection** | Telemetry events buffered in client memory (capped at 100). Auto-flushed upon reconnection. | Presence indicator: `DISCONNECTED` $\to$ `RECONNECTED`. |

---

## 13. UX Track: Universal Design System & WCAG 2.1 AA Compliance

### Design System Standardization
Track 1 delivers visual and interactive consistency across all 4 application density tiers:

1. **Tier 1: Marketing & Authentication** (`/login`, `/register`, onboarding): Spacious, calm contrast, welcoming typography.
2. **Tier 2: Dashboards & Authoring** (Admin, Faculty, Developer): High efficiency, standard 16px grid, clean tabular density, structured forms.
3. **Tier 3: Student Exam Workspace** (`/exams/:id/take`): Minimalist, zero distractions, high-contrast readable question typography, sticky answer navigation, persistent accessible timer.
4. **Tier 4: Invigilator Supervision Matrix** (`/invigilator/live`): Ultra-compact, dark-mode optimized to minimize eye fatigue during surveillance, high-visibility status indicators.

### WCAG 2.1 AA Accessibility Scope
- **Full Keyboard Navigation**:
  - Logical `tabindex` ordering across 100% of interactive elements.
  - Visible focus rings: Universal 2px primary accent ring with 2px offset (`:focus-visible`).
  - Keyboard shortcuts in Exam Workspace: `1-4` for MCQ options, `Alt+N` for Next, `Alt+P` for Previous, `Alt+F` for Flag for Review.
  - Focus trap implementation in all modal dialogs and slide-out drawers.
- **Screen Reader Support & ARIA**:
  - Live regions (`aria-live="polite"`) for exam timer countdown milestones (15m, 5m, 1m warning), answer autosave status, and incoming proctor broadcast alerts.
  - Semantic HTML landmarks: `<main>`, `<nav>`, `<header>`, `<aside>`, `<footer>`.
  - Accessible names (`aria-label`, `aria-labelledby`) on all icon-only buttons.
- **Visual & Contrast Compliance**:
  - Minimum contrast ratio of **4.5:1** for standard body text and **3.0:1** for large text and UI controls.
  - Text scaling supported up to **200%** without horizontal scroll or layout clipping.
  - Respect `@media (prefers-reduced-motion: reduce)` by disabling non-essential transitions and animations.

### Standardized Accessible Destructive Confirmations
Consistent accessible confirmation dialogs (`<ConfirmDestructiveModal>`) requiring deliberate action confirmation for irreversible operations:
- **Student**: Final Exam Submission (`SUBMITTED` state transition).
- **Invigilator**: Candidate Attempt Termination (`TERMINATED` state transition with mandatory written justification).
- **Faculty**: Blueprint Deletion, Question Archival, Result Publication.
- **Admin**: Account Deactivation, Accommodation Override.

---

## 14. Five-Role Responsive Matrix & Playwright E2E Suites

| Role Portal | Target Viewports | Primary Layout Strategy | Responsive Behavior |
| :--- | :--- | :--- | :--- |
| **Admin** | Desktop, Tablet | Collapsible sidebar, responsive data tables | Stacks table filters on tablet; horizontal table scroll with pinned action column. |
| **Developer** | Desktop (Primary) | High-density grid, split-pane log viewer | Optimized for 1280px+ desktop workstations; drawer collapse on smaller screens. |
| **Faculty** | Desktop, Tablet | Split-screen question authoring, grading cards | Single-column stacking for grading rubrics on tablet viewports. |
| **Invigilator** | Desktop (Primary) | 12-stream grid (4x3, 3x2, or 2x2) | Adaptive grid drops to 2x2 or 1-stream view on smaller displays; drawer overlays grid. |
| **Student** | Desktop, Tablet, Mobile | Single-column focus, sticky header & footer | Full fluid responsive layout across viewports from 375px to 4K displays. |

### Playwright Automated E2E Test Suite (All 5 Roles)
1. **Student Journey (`e2e/student-exam-journey.spec.js`)**: Login $\to$ Exam Session Discovery $\to$ Pre-exam rules $\to$ Launch exam $\to$ Answer questions $\to$ Normal navigation & timer ticks (assert zero false anomalies) $\to$ Trigger simulated focus loss $\to$ Verify autosave $\to$ Submit exam $\to$ Assert submission confirmation.
2. **Invigilator Journey (`e2e/invigilator-monitoring.spec.js`)**: Login $\to$ Open live session $\to$ Inspect 12-stream grid $\to$ Receive real-time anomaly event over WebSocket $\to$ Open candidate drawer $\to$ Review risk score $\to$ Dismiss false-positive flag with note $\to$ Assert audit trail entry.
3. **Faculty Journey (`e2e/faculty-assessment.spec.js`)**: Login $\to$ Create question in bank $\to$ Build exam blueprint $\to$ Schedule session $\to$ Grade pending subjective response $\to$ Publish scorecard.
4. **Admin Journey (`e2e/admin-user-lifecycle.spec.js`)**: Login $\to$ User Management $\to$ Ingest user CSV $\to$ Review student ID document $\to$ Approve with notes $\to$ Assert user status updated.
5. **Developer Journey (`e2e/developer-control-plane.spec.js`)**: Login $\to$ Developer Overview $\to$ Subsystem health inspection $\to$ Filter system logs $\to$ View technical audit stream $\to$ Verify zero PII leakage.

---

## 15. Comprehensive Requirements Traceability Matrix

### Old Phase 30 Requirements Audit (UX / Accessibility / E2E)
| Old Phase 30 Req ID | Description | Phase 28 Workstream | Implementation Area | Test / Verification |
| :--- | :--- | :---: | :--- | :--- |
| **P30-01** | Unified CSS Tokens across density tiers | Track 1 (A) | `frontend/src/styles/` | CSS token audit, visual snapshot |
| **P30-02** | Standardized UI State Components | Track 1 (A) | `frontend/src/components/common/` | Unit tests for Loading/Empty/Error/Retry |
| **P30-03** | Two-step Destructive Action Modals | Track 1 (A) | `frontend/src/components/common/` | Component test asserting 2-step confirmation |
| **P30-04** | Responsive Layouts across 5 roles | Track 1 (B) | All role page layouts | Viewport resize tests (375px, 768px, 1280px) |
| **P30-05** | Full Keyboard Navigation & Visible Rings | Track 1 (C) | Universal focus CSS & focus traps | Playwright keyboard Tab-cycle suite |
| **P30-06** | WCAG 2.1 AA Screen Reader & ARIA | Track 1 (C) | Landmarks, `aria-live`, alt tags | Automated `axe-core` scan (zero violations) |
| **P30-07** | Text Scaling up to 200% | Track 1 (C) | Root rem units & fluid typography | Browser zoom visual inspection |
| **P30-08** | Automated Playwright 5-Role Journeys | Track 1 (D) | `tests/e2e/*.spec.js` | 5 complete green Playwright E2E suites |
| **P30-09** | Visual Regression Snapshot Suite | Track 1 (D) | `tests/e2e/visual/*.spec.js` | Playwright screenshot comparison tests |

### Old Phase 31 Requirements Audit (Continuous AI Proctoring)
| Old Phase 31 Req ID | Original Conceptual Specification | Phase 28 Architectural Disposition | Corrected Implementation & Rationale |
| :--- | :--- | :---: | :--- |
| **P31-01** | Client Web Worker AI Runtime | **IMPLEMENTED** (Track 2, E) | Dedicated Web Worker with ONNX Runtime Web WASM. |
| **P31-02** | Real-time Face Presence Detection | **REMOVED FROM CONTINUOUS SCOPE** | Webcam is not continuously streamed. Phase 25 verifies face at check-in. |
| **P31-03** | Multiple-Face Detection | **REMOVED FROM CONTINUOUS SCOPE** | Webcam is not continuously streamed. |
| **P31-04** | Gaze Angle Tracking | **REMOVED FROM CONTINUOUS SCOPE** | Webcam is not continuously streamed; highly error-prone. |
| **P31-05** | Audio Speech Classification | **REMOVED FROM CONTINUOUS SCOPE** | Candidate audio is not continuously streamed. |
| **P31-06** | Rule-Based Focus & Tab Telemetry | **IMPLEMENTED** (Track 2, F) | Window blur, Page Visibility, Fullscreen API event listeners. |
| **P31-07** | Screen Stream Degradation Tracking | **IMPLEMENTED** (Track 2, F) | Media track `ended` and frame delivery rate monitoring. |
| **P31-08** | Screen Context Classification | **IMPLEMENTED** (Track 2, G) | MobileNetV3-Small classifier in Web Worker (`EXAM`, `NON_EXAM`, `UNKNOWN`). |
| **P31-09** | Server Anomaly Ingestion & Validation| **IMPLEMENTED** (Track 2, H) | Zod schema validation, sliding window rate limits, idempotency. |
| **P31-10** | Server-Authoritative Risk Scorer | **IMPLEMENTED** (Track 2, H) | 0–100 derived anomaly score with temporal dampening & server-side correlation. |
| **P31-11** | Invigilator AI Overlay & Drawer | **IMPLEMENTED** (Track 2, I) | 12-stream risk badges, source tags, auditable flag dismissal. |
| **P31-12** | Evidence Snapshot Storage | **IMPLEMENTED** (Track 2, I) | Reuse Phase 18 / Phase 26 S3 presigned evidence pipeline (snapshots only). |

---

## 16. Database Impact Analysis

### Schema Verification
Inspection of active migrations on `main`:
- `016_proctoring_events_and_flags.js`: Defines `violation_events` (with `client_event_id`, `client_timestamp`, `event_type`, `metadata` JSONB), `violation_flags` (with `flag_type`, `severity`, `status`, `score_delta`, `details` JSONB), and `exam_attempts.risk_score` (INT CHECK 0–100).
- `017_evidence_storage.js`: Defines `evidence_records` with polymorphic linkage to violations and flags.
- `015_audit_immutability.js`: Enforces append-only triggers on `audit_logs`.

### Authoritative Decision
```
DATABASE MIGRATION: NOT REQUIRED
```
The existing database schema fully accommodates all Phase 28 telemetry events, screen classification metadata, server-derived risk scores, and invigilator triage actions without requiring any migration.

---

## 17. Architecture Decision Record (ADR) Review

### Proposed ADR: ADR-0012
**Title**: `0012-client-side-web-worker-screen-ai-inference-and-server-authoritative-telemetry-ingestion.md`

- **Context**: ProctorNet requires continuous screen-based context monitoring and deterministic browser telemetry for 100+ concurrent candidates without saturating backend compute or incurring cloud API costs.
- **Decision**: Execute lightweight image classification (MobileNetV3-Small ONNX WASM candidate) entirely within a client-side Web Worker at low sampling rates (~0.25 FPS). Transmit small advisory JSON observation events to the backend. Enforce zero-trust server-authoritative risk scoring (0–100) and temporal dampening.
- **Status**: Proposed for formal adoption upon Phase 28 implementation approval.

---

## 18. Tiered Verification Plan (Levels 1–5)

```
LEVEL 1: FAST STATIC & SCHEMA CHECKS
- ESLint & Prettier code quality checks
- Zod schema validation tests for all 8 proctoring telemetry event types
- Web Worker syntax, packaging, and bundle size verification
- Automated axe-core accessibility linting on all UI components

LEVEL 2: WORKSTREAM UNIT & COMPONENT TESTS
- AnomalyScorer unit tests (scoring increments, temporal dampening, threshold triggers)
- Web Worker message passing & frame queue backpressure unit tests
- Screen frame downsampling and OffscreenCanvas conversion unit tests
- False-positive control tests: Assert normal question nav, timer ticks, and scroll do not trigger anomalies
- UI state components (Loading, Empty, Error, ConfirmDestructiveModal) rendering tests
- Keyboard navigation and focus trap unit tests

LEVEL 3: SUBSYSTEM & INTEGRATION TESTS
- HTTP POST /api/v1/attempts/:id/events ingestion integration tests
- Redis sliding-window rate limiter enforcement tests
- Idempotent deduplication tests (duplicate client_event_id)
- WebSocket real-time broadcast of anomaly events to invigilator room
- Invigilator flag dismissal and audit trail generation integration tests

LEVEL 4: SECURITY BOUNDARY & ABUSE TESTS
- Malicious client payload tests (forged riskScore / severity rejected with HTTP 400)
- BOLA verification (student forbidden from accessing staff proctoring timeline)
- Future timestamp injection rejection (>60s in future rejected)
- Telemetry flood attack test (assert rate limiter throttles with HTTP 429)
- Worker crash simulation & graceful fallback to rule-based telemetry

LEVEL 5: FULL SYSTEM REGRESSION & PLAYWRIGHT E2E JOURNEYS
- Complete 5-role automated user journeys (Admin, Developer, Faculty, Invigilator, Student)
- Multi-viewport responsive visual regression snapshot suite
- End-to-end simulated exam with active screen proctoring, focus loss, and safe submission
```

---

## 19. Final Quality Check Gate

- [x] No continuous camera AI.
- [x] No continuous audio AI.
- [x] Screen stream is the continuous AI input.
- [x] Browser telemetry is deterministic rule-based.
- [x] Screen AI is advisory only.
- [x] MobileNetV3-Small is a candidate model, not an unverified guarantee.
- [x] No centralized per-frame server inference.
- [x] 100/500/1000 capacity numbers are clearly marked as engineering estimates / benchmark targets.
- [x] Screen context classification avoids normal exam UI false positives.
- [x] Repeated context switching is server-derived.
- [x] Risk score is server-authoritative (0–100).
- [x] Raw screen frames are not continuously uploaded.
- [x] Evidence snapshots use existing private S3 architecture.
- [x] Inherent browser limitations are documented.
- [x] Candidate privacy boundaries are explicit.
- [x] Old Phase 30 requirements remain fully covered (9/9).
- [x] Applicable Old Phase 31 requirements remain fully covered (7/7 applicable; 5 continuous camera/audio items removed).
- [x] No Phase 29 scope is pulled forward.

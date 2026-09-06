# ProctorNet — Core Domain Layer & State Machines

## 1. Domain Architecture Overview

The **Core Domain Layer** (`backend/src/domain/`) models the fundamental business entities, value objects, lifecycle state machines, and invariants for ProctorNet.

### Guiding Principles:
1. **Pure Domain Logic (Zero External I/O)**:
   - Domain modules contain **no** database queries, Redis clients, RabbitMQ bindings, Express `req`/`res` references, filesystem access, or network calls.
   - Domain functions and state machines are pure, deterministic, and easily testable.
2. **Authoritative State Authority**:
   - The domain layer defines the authoritative production states and transition matrices conforming to the Step 13.5 architectural specification.
3. **Fail-Fast Invariant Enforcement**:
   - Illegal state transitions and violated domain rules throw typed domain errors (`DomainError`, `InvalidStateTransitionError`, `DomainInvariantError`, `InvalidQuestionDefinitionError`) rather than returning ambiguous fallback states.

---

## 2. Directory Structure

```
backend/src/domain/
├── exam/
│   ├── examStates.js          # Authoritative ExamStatus enum & transition map
│   ├── examStateMachine.js    # Deterministic transitionExamState & guards
│   └── examInvariants.js      # Exam definition & mutation boundary rules
├── attempt/
│   ├── attemptStates.js       # Authoritative AttemptStatus enum & transition map
│   ├── attemptStateMachine.js # Deterministic transitionAttemptState & guards
│   └── attemptInvariants.js   # Attempt bounds & active-answer authorization guards
├── question/
│   └── questionTypes.js       # MCQ, TRUE_FALSE, NUMERIC validations
├── evaluation/
│   └── evaluationStatus.js    # EvaluationStatus lifecycle & transitions
├── shared/
│   └── domainErrors.js        # Domain error class hierarchy
└── index.js                   # Central barrel export
```

---

## 3. Authoritative Lifecycles & State Machines

### 3.1 Exam Lifecycle

```
[DRAFT] ---> [PUBLISHED] ---> [SCHEDULED] ---> [LIVE] ---> [ENDED] ---> [EVALUATED] ---> [RESULT_PUBLISHED]
```

#### Transition Matrix:
| From State | Allowed Target State(s) | Description |
| :--- | :--- | :--- |
| `DRAFT` | `PUBLISHED` | Exam authoring is finalized and locked. |
| `PUBLISHED` | `SCHEDULED` | Exam is assigned to room(s) / session time slot(s). |
| `SCHEDULED` | `LIVE` | Session start time reached; candidates can begin. |
| `LIVE` | `ENDED` | Scheduled session end time reached. |
| `ENDED` | `EVALUATED` | Automated/manual evaluation completed for all attempts. |
| `EVALUATED` | `RESULT_PUBLISHED` | Final scores, ranks, and report cards released. |
| `RESULT_PUBLISHED` | *(None)* | Terminal state. |

#### Invariants:
- **Strict Linear Forward Progression**: Backward transitions and skipped stages are strictly forbidden.
- **Immutability Barrier**: Once an exam transitions to `PUBLISHED` or beyond, its structural rules and questions cannot be mutated.

---

### 3.2 Exam Attempt Lifecycle

```
                     +---> [SUBMITTED]    (Student submits)
                     |
[READY] ---> [ACTIVE] +---> [TERMINATED]   (Proctor/security override)
                     |
                     +---> [EXPIRED]      (Authoritative deadline elapsed)
```

#### Transition Matrix:
| From State | Allowed Target State(s) | Description |
| :--- | :--- | :--- |
| `READY` | `ACTIVE` | Student initiates attempt on authorized session start. |
| `ACTIVE` | `SUBMITTED` | Candidate completes exam and explicitly submits. |
| `ACTIVE` | `TERMINATED` | Proctor or system terminates attempt due to severe violation. |
| `ACTIVE` | `EXPIRED` | Server-side timer elapses without candidate submission. |
| `SUBMITTED` | *(None)* | Terminal state. |
| `TERMINATED` | *(None)* | Terminal state. |
| `EXPIRED` | *(None)* | Terminal state. |

#### Invariants:
- **No Backward Transitions**: An attempt cannot revert to `READY` or `ACTIVE` once finalized.
- **Answer Modification Guard**: Answers and autosaves can only be recorded when the attempt is strictly `ACTIVE`.

---

### 3.3 Question Types (v1 Baseline)

| Question Type | Definition & Invariants |
| :--- | :--- |
| `MCQ` | Multiple Choice Question with $\ge 2$ options, at least one correct option, and unique display orders. |
| `TRUE_FALSE` | Binary question with exactly 2 options and exactly 1 correct option. |
| `NUMERIC` | Direct numeric answer with finite, defined `correct_numeric_value`. |

---

### 3.4 Evaluation Status Lifecycle

```
[PENDING] ---> [IN_PROGRESS] ---> [COMPLETED]
                     |
                     +---> [FAILED] ---> [IN_PROGRESS] (Retry)
```

---

## 4. Error Hierarchy

All domain exceptions inherit from `DomainError`:

- `DomainError`
  - `InvalidStateTransitionError`: Thrown when an illegal state change is attempted. Contains `entity`, `currentState`, `requestedState`, and `allowedTransitions`.
  - `DomainInvariantError`: Thrown when an entity violates core business constraints.
  - `InvalidQuestionDefinitionError`: Thrown when a question schema or option array fails structural invariants.

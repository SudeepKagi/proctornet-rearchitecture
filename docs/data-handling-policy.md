# ProctorNet — Student Identity and Exam Data Handling Policy

**Effective Date:** September 2026  
**Audience:** Students, Faculty, Examination Coordinators, and Academic Administrators

---

## 1. Overview & Core Philosophy

ProctorNet is an academic examination platform engineered with privacy-first principles. We believe that maintaining academic integrity should never come at the expense of student dignity. 

Our core data commitments:
1. **No continuous biometric surveillance:** We do not perform continuous facial emotion recognition, gaze tracking, eye-movement tracking, or room audio listening.
2. **Minimal, purposeful collection:** We collect only what is strictly necessary to confirm identity and ensure a fair examination environment.
3. **Automated deletion:** Photos and temporary exam activity snapshots are deleted automatically by scheduled background jobs.
4. **Human-in-the-loop review:** Automated checks never disqualify a student or adjust grades; only authorized human faculty can review flags and make decisions.

---

## 2. What Data Is Collected and Stored

| Data Category | Specific Items Collected | Purpose | Where It Is Stored |
|---|---|---|---|
| **Account Information** | Full name, college email, student ID, enrolled courses | Authentication, course roster matching, and exam assignment | PostgreSQL database |
| **Photo Identity Baseline** | Single front-facing reference photo taken during enrollment | Baseline comparison to verify student identity before an exam starts | Encrypted private cloud storage (AES-256) |
| **Identity Document** | Photo of college ID card or government ID | One-time identity confirmation during onboarding | Encrypted private cloud storage (AES-256) |
| **Pre-Exam Check-in Snapshot** | Single webcam photo taken when checking in to an exam | Confirms that the person sitting for the exam is the registered student | Encrypted private cloud storage (AES-256) |
| **Exam Activity Telemetry** | Timestamped events: window focus changes, fullscreen exits, screen sharing status | Flags interruptions or multi-display usage for invigilator review | PostgreSQL exam attempt records |
| **Academic Work** | Submitted answers, question choices, timestamps, continuous autosave drafts | Scoring and evaluation of the exam attempt | PostgreSQL database |
| **Audit Records** | Timestamped log of proctor notes, pause actions, grade submissions, and overrides | Transparency, grade dispute resolution, and academic integrity assurance | PostgreSQL tamper-proof table |

---

## 3. Data Retention and Automated Deletion Schedule

ProctorNet runs automated data retention sweepers (`scripts/retention/run-retention-sweepers.js`) to ensure student media is not kept indefinitely:

| Category | Retention Window | Purge Mechanism |
|---|---|---|
| **Pre-Exam Verification Photos & Evidence** | **90 days** | Automated sweeper permanently deletes media files and removes object pointers. |
| **Raw Enrollment Photos** | **7 days** | Cleaned up once initial enrollment baseline is processed. |
| **Student ID Documents** | **180 days** | Retained through the end of the academic grading appeal window, then purged. |
| **Exam Activity Telemetry Flags** | **30 days** | Detail flags summarized into session report and raw logs cleared. |
| **Official Grades & Assessment Records** | Academic Term / Institutional Policy | Managed per standard university registrar retention requirements. |
| **System Audit Logs** | Indefinite (Academic Record) | Protected by database-level triggers against modification or deletion. |

---

## 4. Who Can Access Your Data and How It Is Audited

1. **Strict Role-Based Isolation:**
   - **Students** can only view their own profile, enrolled exams, and published scorecards.
   - **Instructors & Invigilators** can only view students enrolled in their assigned course or scheduled exam session.
   - **Administrators** can view enrollment queues to approve or reject student onboarding documents.
2. **Secure Media Access:**
   - All photos and ID cards are stored in private storage with no public internet access.
   - When an instructor views an activity photo in the exam review modal, the platform generates a temporary, cryptographically signed link valid for only 15 minutes.
3. **Audit Trail:**
   - Every administrative review, proctor warning, exam pause, and grade change is permanently written to an immutable audit table.
   - Any attempt to alter or delete past audit entries is rejected by database triggers.

---

## 5. Student Consent & Accommodations

- **Informed Consent:** When students first set up their profile, they are shown what data will be captured and how it will be used. Photo capture requires explicit camera permissions in the browser.
- **Medical & Religious Accommodations:** Students with approved university accommodations can have an administrator set a medical exemption flag on their account. This bypasses automated photo verification and routes the student to a manual check-in with their instructor.
- **Right to Appeal:** If an exam attempt is flagged or paused, the student has the right to request a full review with their instructor or department coordinator. All notes and timestamps recorded during the session are available for independent review.

---

## 6. Contact & Data Requests

For questions regarding your exam data, or to request manual identity verification under institutional guidelines, please contact your course instructor or university examination office.

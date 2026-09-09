/**
 * Migration 021: Phase 26 — Examination & Invigilation Schema
 * Implements authoritative database schema for:
 * 1. question_banks (Reusable question bank repositories)
 * 2. questions extensions (difficulty, bloom_level, tags, version, rubric, subjective question types)
 * 3. exam_topic_rules extensions (difficulty and bloom_level rule constraints)
 * 4. exam_attempts extensions (PAUSED state, pause metadata, termination metadata)
 * 5. manual_grades & manual_grade_audits (Subjective question grading, rubrics, immutable score audit trail)
 * 6. proctor_interventions (Live invigilator intervention logging: announcement, message, pause, resume, terminate)
 * 7. exam_analytics_cache (Materialized item discrimination, difficulty index, score histograms, completion metrics)
 */

export async function up(pgm) {
  pgm.sql(`
    -- 1. Create question_banks table
    CREATE TABLE IF NOT EXISTS question_banks (
      bank_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      subject_id UUID REFERENCES subjects(subject_id) ON DELETE SET NULL,
      is_shared BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_question_banks_created_by ON question_banks(created_by);
    CREATE INDEX IF NOT EXISTS idx_question_banks_subject ON question_banks(subject_id);

    -- 2. Extend questions table
    ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS bank_id UUID REFERENCES question_banks(bank_id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS difficulty VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
      ADD COLUMN IF NOT EXISTS bloom_level VARCHAR(32) NOT NULL DEFAULT 'REMEMBER',
      ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS parent_question_id UUID REFERENCES questions(question_id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED',
      ADD COLUMN IF NOT EXISTS rubric JSONB NOT NULL DEFAULT '{}'::jsonb;

    ALTER TABLE questions
      DROP CONSTRAINT IF EXISTS questions_question_type_check;

    ALTER TABLE questions
      ADD CONSTRAINT questions_question_type_check 
        CHECK (question_type IN ('MCQ', 'TRUE_FALSE', 'NUMERIC', 'SHORT_ANSWER', 'ESSAY', 'CODE')),
      ADD CONSTRAINT check_question_difficulty 
        CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
      ADD CONSTRAINT check_question_bloom_level 
        CHECK (bloom_level IN ('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE')),
      ADD CONSTRAINT check_question_status 
        CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
      ADD CONSTRAINT check_question_version 
        CHECK (version >= 1);

    CREATE INDEX IF NOT EXISTS idx_questions_bank ON questions(bank_id);
    CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
    CREATE INDEX IF NOT EXISTS idx_questions_bloom ON questions(bloom_level);

    -- 3. Extend exam_topic_rules table
    ALTER TABLE exam_topic_rules
      ADD COLUMN IF NOT EXISTS difficulty VARCHAR(32) NOT NULL DEFAULT 'ANY',
      ADD COLUMN IF NOT EXISTS bloom_level VARCHAR(32) NOT NULL DEFAULT 'ANY';

    ALTER TABLE exam_topic_rules
      DROP CONSTRAINT IF EXISTS check_rule_difficulty,
      DROP CONSTRAINT IF EXISTS check_rule_bloom_level;

    ALTER TABLE exam_topic_rules
      ADD CONSTRAINT check_rule_difficulty 
        CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD', 'ANY')),
      ADD CONSTRAINT check_rule_bloom_level 
        CHECK (bloom_level IN ('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE', 'ANY'));

    -- 4. Extend exam_attempts table for Pause / Resume / Terminate lifecycle
    ALTER TABLE exam_attempts
      ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS total_paused_ms BIGINT NOT NULL DEFAULT 0 CHECK (total_paused_ms >= 0),
      ADD COLUMN IF NOT EXISTS pause_reason TEXT,
      ADD COLUMN IF NOT EXISTS paused_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS termination_reason TEXT,
      ADD COLUMN IF NOT EXISTS terminated_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;

    ALTER TABLE exam_attempts
      DROP CONSTRAINT IF EXISTS exam_attempts_status_check;

    ALTER TABLE exam_attempts
      ADD CONSTRAINT exam_attempts_status_check 
        CHECK (status IN ('READY', 'ACTIVE', 'PAUSED', 'SUBMITTED', 'TERMINATED', 'EXPIRED'));

    CREATE INDEX IF NOT EXISTS idx_exam_attempts_session_status ON exam_attempts(session_id, status);

    -- 5. Create manual_grades table
    CREATE TABLE IF NOT EXISTS manual_grades (
      grade_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_question_id UUID NOT NULL REFERENCES attempt_questions(attempt_question_id) ON DELETE CASCADE,
      attempt_id UUID NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
      grader_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      points_awarded NUMERIC(6, 2) NOT NULL CHECK (points_awarded >= 0),
      max_points NUMERIC(6, 2) NOT NULL CHECK (max_points > 0),
      rubric_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
      feedback TEXT,
      rationale TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_manual_grades_attempt_question UNIQUE (attempt_question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_manual_grades_attempt ON manual_grades(attempt_id);
    CREATE INDEX IF NOT EXISTS idx_manual_grades_grader ON manual_grades(grader_user_id);

    -- 6. Create manual_grade_audits table (Immutable score override history)
    CREATE TABLE IF NOT EXISTS manual_grade_audits (
      audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      grade_id UUID NOT NULL REFERENCES manual_grades(grade_id) ON DELETE CASCADE,
      attempt_id UUID NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
      grader_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      previous_points NUMERIC(6, 2),
      new_points NUMERIC(6, 2) NOT NULL CHECK (new_points >= 0),
      rationale TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_manual_grade_audits_grade ON manual_grade_audits(grade_id);
    CREATE INDEX IF NOT EXISTS idx_manual_grade_audits_attempt ON manual_grade_audits(attempt_id);

    -- 7. Create proctor_interventions table
    CREATE TABLE IF NOT EXISTS proctor_interventions (
      intervention_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES exam_sessions(session_id) ON DELETE CASCADE,
      attempt_id UUID REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
      invigilator_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      type VARCHAR(32) NOT NULL 
        CHECK (type IN ('ANNOUNCEMENT', 'WARNING_MESSAGE', 'PAUSE', 'RESUME', 'TERMINATE')),
      message TEXT,
      reason TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_proctor_interventions_session_time 
      ON proctor_interventions(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_proctor_interventions_attempt 
      ON proctor_interventions(attempt_id);

    -- 8. Create exam_analytics_cache table
    CREATE TABLE IF NOT EXISTS exam_analytics_cache (
      exam_id UUID PRIMARY KEY REFERENCES exams(exam_id) ON DELETE CASCADE,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sample_size INT NOT NULL CHECK (sample_size >= 0),
      score_histogram JSONB NOT NULL DEFAULT '[]'::jsonb,
      completion_time_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
      item_metrics JSONB NOT NULL DEFAULT '[]'::jsonb
    );
  `);
}

export async function down(pgm) {
  pgm.sql(`
    -- 1. Drop analytics cache table
    DROP TABLE IF EXISTS exam_analytics_cache;

    -- 2. Drop proctor interventions table
    DROP INDEX IF EXISTS idx_proctor_interventions_attempt;
    DROP INDEX IF EXISTS idx_proctor_interventions_session_time;
    DROP TABLE IF EXISTS proctor_interventions;

    -- 3. Drop manual grade audits and manual grades tables
    DROP INDEX IF EXISTS idx_manual_grade_audits_attempt;
    DROP INDEX IF EXISTS idx_manual_grade_audits_grade;
    DROP TABLE IF EXISTS manual_grade_audits;

    DROP INDEX IF EXISTS idx_manual_grades_grader;
    DROP INDEX IF EXISTS idx_manual_grades_attempt;
    DROP TABLE IF EXISTS manual_grades;

    -- 4. Revert exam_attempts status check and drop pause/termination columns
    DROP INDEX IF EXISTS idx_exam_attempts_session_status;
    ALTER TABLE exam_attempts
      DROP CONSTRAINT IF EXISTS exam_attempts_status_check;

    ALTER TABLE exam_attempts
      ADD CONSTRAINT exam_attempts_status_check 
        CHECK (status IN ('READY', 'ACTIVE', 'SUBMITTED', 'TERMINATED', 'EXPIRED')),
      DROP COLUMN IF EXISTS terminated_by_user_id,
      DROP COLUMN IF EXISTS termination_reason,
      DROP COLUMN IF EXISTS paused_by_user_id,
      DROP COLUMN IF EXISTS pause_reason,
      DROP COLUMN IF EXISTS total_paused_ms,
      DROP COLUMN IF EXISTS paused_at;

    -- 5. Revert exam_topic_rules difficulty & bloom constraints
    ALTER TABLE exam_topic_rules
      DROP CONSTRAINT IF EXISTS check_rule_bloom_level,
      DROP CONSTRAINT IF EXISTS check_rule_difficulty,
      DROP COLUMN IF EXISTS bloom_level,
      DROP COLUMN IF EXISTS difficulty;

    -- 6. Revert questions status, version, rubric, difficulty, bloom, and type constraints
    DROP INDEX IF EXISTS idx_questions_bloom;
    DROP INDEX IF EXISTS idx_questions_difficulty;
    DROP INDEX IF EXISTS idx_questions_bank;

    ALTER TABLE questions
      DROP CONSTRAINT IF EXISTS check_question_version,
      DROP CONSTRAINT IF EXISTS check_question_status,
      DROP CONSTRAINT IF EXISTS check_question_bloom_level,
      DROP CONSTRAINT IF EXISTS check_question_difficulty,
      DROP CONSTRAINT IF EXISTS questions_question_type_check;

    ALTER TABLE questions
      ADD CONSTRAINT questions_question_type_check 
        CHECK (question_type IN ('MCQ', 'TRUE_FALSE', 'NUMERIC')),
      DROP COLUMN IF EXISTS rubric,
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS parent_question_id,
      DROP COLUMN IF EXISTS version,
      DROP COLUMN IF EXISTS tags,
      DROP COLUMN IF EXISTS bloom_level,
      DROP COLUMN IF EXISTS difficulty,
      DROP COLUMN IF EXISTS bank_id;

    -- 7. Drop question_banks table
    DROP INDEX IF EXISTS idx_question_banks_subject;
    DROP INDEX IF EXISTS idx_question_banks_created_by;
    DROP TABLE IF EXISTS question_banks;
  `);
}

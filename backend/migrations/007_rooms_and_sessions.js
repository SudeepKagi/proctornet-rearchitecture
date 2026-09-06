/**
 * Migration 007: Rooms, Exam Sessions, Session Students, Session Invigilators
 */
export async function up(pgm) {
  pgm.sql(`
    -- Rooms table
    CREATE TABLE IF NOT EXISTS rooms (
      room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(128) NOT NULL UNIQUE,
      capacity INT NOT NULL CHECK (capacity > 0),
      building VARCHAR(128),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Exam Sessions table
    CREATE TABLE IF NOT EXISTS exam_sessions (
      session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exam_id UUID NOT NULL REFERENCES exams(exam_id) ON DELETE RESTRICT,
      room_id UUID REFERENCES rooms(room_id) ON DELETE SET NULL,
      scheduled_start_time TIMESTAMPTZ NOT NULL,
      scheduled_end_time TIMESTAMPTZ NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'ACTIVE', 'CONCLUDED', 'CANCELLED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT check_session_times CHECK (scheduled_end_time > scheduled_start_time)
    );

    -- Session Students mapping table (Mandatory UNIQUE on session_id, student_id)
    CREATE TABLE IF NOT EXISTS session_students (
      session_id UUID NOT NULL REFERENCES exam_sessions(session_id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      status VARCHAR(32) NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'PRESENT', 'ABSENT', 'DISQUALIFIED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, student_id)
    );

    -- Session Invigilators mapping table
    CREATE TABLE IF NOT EXISTS session_invigilators (
      session_id UUID NOT NULL REFERENCES exam_sessions(session_id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
      role VARCHAR(32) NOT NULL DEFAULT 'PRIMARY' CHECK (role IN ('PRIMARY', 'SECONDARY')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, user_id)
    );
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS session_invigilators;
    DROP TABLE IF EXISTS session_students;
    DROP TABLE IF EXISTS exam_sessions;
    DROP TABLE IF EXISTS rooms;
  `);
}

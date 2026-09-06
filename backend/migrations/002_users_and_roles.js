/**
 * Migration 002: Users, User Roles, Student Profiles, Faculty Profiles
 */
export async function up(pgm) {
  pgm.sql(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(32),
      password_hash VARCHAR(255) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LOCKED', 'DISABLED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- User Roles table
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      role VARCHAR(32) NOT NULL CHECK (role IN ('STUDENT', 'FACULTY', 'INVIGILATOR', 'ADMIN')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, role)
    );

    -- Student Profiles table
    CREATE TABLE IF NOT EXISTS student_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
      enrollment_number VARCHAR(64) NOT NULL UNIQUE,
      department VARCHAR(128) NOT NULL,
      semester INT NOT NULL CHECK (semester >= 1 AND semester <= 12),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Faculty Profiles table
    CREATE TABLE IF NOT EXISTS faculty_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
      employee_id VARCHAR(64) NOT NULL UNIQUE,
      department VARCHAR(128) NOT NULL,
      designation VARCHAR(128) NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS faculty_profiles;
    DROP TABLE IF EXISTS student_profiles;
    DROP TABLE IF EXISTS user_roles;
    DROP TABLE IF EXISTS users;
  `);
}

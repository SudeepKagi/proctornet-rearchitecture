/**
 * Migration 025: Canonical Academic Departments
 * Creates canonical departments lookup table seeded with standardized academic disciplines.
 * Adds foreign key department_id to student_profiles, faculty_profiles, exams, and exam_sessions.
 */

export const CANONICAL_DEPARTMENTS = [
  { code: 'CSE', name: 'Computer Science and Engineering (CSE)' },
  { code: 'ECE', name: 'Electronics and Communication Engineering (ECE)' },
  { code: 'ISE', name: 'Information Science and Engineering (ISE)' },
  { code: 'EEE', name: 'Electrical and Electronics Engineering (EEE)' },
  { code: 'ME', name: 'Mechanical Engineering (ME)' },
  { code: 'CE', name: 'Civil Engineering (CE)' },
  { code: 'AIML', name: 'Artificial Intelligence & Machine Learning (AIML)' },
  { code: 'DSE', name: 'Data Science & Engineering (DSE)' },
  { code: 'BT', name: 'Biotechnology (BT)' },
  { code: 'CHE', name: 'Chemical Engineering (CHE)' },
  { code: 'AE', name: 'Aerospace Engineering (AE)' },
  { code: 'ROB', name: 'Robotics & Automation' },
  { code: 'BME', name: 'Biomedical Engineering' },
  { code: 'IPE', name: 'Industrial & Production Engineering' },
  { code: 'MNC', name: 'Mathematics & Computing' },
  { code: 'PAS', name: 'Physics & Applied Sciences' },
  { code: 'OTHER', name: 'Other' }
];

export async function up(pgm) {
  pgm.sql(`
    -- 1. Create canonical departments table
    CREATE TABLE IF NOT EXISTS departments (
      department_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(32) UNIQUE NOT NULL,
      name VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Seed canonical departments
    INSERT INTO departments (code, name) VALUES
      ('CSE', 'Computer Science and Engineering (CSE)'),
      ('ECE', 'Electronics and Communication Engineering (ECE)'),
      ('ISE', 'Information Science and Engineering (ISE)'),
      ('EEE', 'Electrical and Electronics Engineering (EEE)'),
      ('ME', 'Mechanical Engineering (ME)'),
      ('CE', 'Civil Engineering (CE)'),
      ('AIML', 'Artificial Intelligence & Machine Learning (AIML)'),
      ('DSE', 'Data Science & Engineering (DSE)'),
      ('BT', 'Biotechnology (BT)'),
      ('CHE', 'Chemical Engineering (CHE)'),
      ('AE', 'Aerospace Engineering (AE)'),
      ('ROB', 'Robotics & Automation'),
      ('BME', 'Biomedical Engineering'),
      ('IPE', 'Industrial & Production Engineering'),
      ('MNC', 'Mathematics & Computing'),
      ('PAS', 'Physics & Applied Sciences'),
      ('OTHER', 'Other')
    ON CONFLICT (code) DO NOTHING;

    -- 3. Add department_id foreign key columns
    ALTER TABLE student_profiles
      ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(department_id) ON DELETE SET NULL;

    ALTER TABLE faculty_profiles
      ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(department_id) ON DELETE SET NULL;

    ALTER TABLE exams
      ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(department_id) ON DELETE SET NULL;

    ALTER TABLE exam_sessions
      ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(department_id) ON DELETE SET NULL;

    -- 4. Create indexes for fast joins
    CREATE INDEX IF NOT EXISTS idx_student_profiles_dept ON student_profiles(department_id);
    CREATE INDEX IF NOT EXISTS idx_faculty_profiles_dept ON faculty_profiles(department_id);
    CREATE INDEX IF NOT EXISTS idx_exams_dept ON exams(department_id);
    CREATE INDEX IF NOT EXISTS idx_exam_sessions_dept ON exam_sessions(department_id);

    -- 5. Backfill department_id from existing free-text fields
    UPDATE student_profiles sp
    SET department_id = d.department_id
    FROM departments d
    WHERE sp.department_id IS NULL
      AND (
        LOWER(sp.department) = LOWER(d.name)
        OR LOWER(sp.department) = LOWER(d.code)
        OR d.name ILIKE '%' || sp.department || '%'
        OR sp.department ILIKE '%' || d.code || '%'
        OR sp.department ILIKE '%' || SPLIT_PART(d.name, ' (', 1) || '%'
      );

    UPDATE faculty_profiles fp
    SET department_id = d.department_id
    FROM departments d
    WHERE fp.department_id IS NULL
      AND (
        LOWER(fp.department) = LOWER(d.name)
        OR LOWER(fp.department) = LOWER(d.code)
        OR d.name ILIKE '%' || fp.department || '%'
        OR fp.department ILIKE '%' || d.code || '%'
        OR fp.department ILIKE '%' || SPLIT_PART(d.name, ' (', 1) || '%'
      );

    UPDATE exams e
    SET department_id = d.department_id
    FROM departments d
    WHERE e.department_id IS NULL
      AND e.target_department IS NOT NULL
      AND (
        LOWER(e.target_department) = LOWER(d.name)
        OR LOWER(e.target_department) = LOWER(d.code)
        OR d.name ILIKE '%' || e.target_department || '%'
        OR e.target_department ILIKE '%' || d.code || '%'
        OR e.target_department ILIKE '%' || SPLIT_PART(d.name, ' (', 1) || '%'
      );

    UPDATE exam_sessions es
    SET department_id = d.department_id
    FROM departments d
    WHERE es.department_id IS NULL
      AND es.target_department IS NOT NULL
      AND (
        LOWER(es.target_department) = LOWER(d.name)
        OR LOWER(es.target_department) = LOWER(d.code)
        OR d.name ILIKE '%' || es.target_department || '%'
        OR es.target_department ILIKE '%' || d.code || '%'
        OR es.target_department ILIKE '%' || SPLIT_PART(d.name, ' (', 1) || '%'
      );
  `);
}

export async function down(pgm) {
  pgm.sql(`
    ALTER TABLE exam_sessions DROP COLUMN IF EXISTS department_id;
    ALTER TABLE exams DROP COLUMN IF EXISTS department_id;
    ALTER TABLE faculty_profiles DROP COLUMN IF EXISTS department_id;
    ALTER TABLE student_profiles DROP COLUMN IF EXISTS department_id;
    DROP TABLE IF EXISTS departments CASCADE;
  `);
}

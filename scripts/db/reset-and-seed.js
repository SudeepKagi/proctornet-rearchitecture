/**
 * @file reset-and-seed.js
 * @description Complete database wipe and clean re-seeding script for ProctorNet.
 * Creates 4 accounts with unverified status (isVerified: false / verification_status: 'UNVERIFIED'):
 *  1. Admin     - admin@proctornet.edu
 *  2. Dev       - dev@proctornet.edu
 *  3. Faculty   - faculty@proctornet.edu
 *  4. Student   - sudeep@proctornet.edu (with enrolled AWS S3 reference photo link)
 *
 * Usage:
 *   node scripts/db/reset-and-seed.js
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(new URL('../../backend/package.json', import.meta.url));

const pg = require('pg');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });

const { Pool } = pg;
const { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5433),
  database: process.env.DB_NAME || 'proctornet',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  connectionTimeoutMillis: 5000
});

// Configure AWS S3 Client for LocalStack / S3 seeding
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:4566',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test'
  }
});

const S3_BUCKET = process.env.S3_BUCKET_NAME || 'proctornet-evidence-dev-01';
const SUDEEP_REFERENCE_KEY = 'reference-photos/sudeep-reference.jpg';
const SUDEEP_MOCK_S3_URL = `https://${S3_BUCKET}.s3.ap-south-1.amazonaws.com/${SUDEEP_REFERENCE_KEY}`;

// The 4 requested evaluation accounts
export const SEED_ACCOUNTS = [
  {
    role: 'ADMIN',
    name: 'System Administrator',
    email: 'admin@proctornet.edu',
    password: 'Admin#2026_SecureExams!',
    status: 'ACTIVE',
    verificationStatus: 'UNVERIFIED',
    mustChangePassword: false
  },
  {
    role: 'DEVELOPER',
    name: 'Developer Operations',
    email: 'dev@proctornet.edu',
    password: 'Dev#2026_SecureExams!',
    status: 'ACTIVE',
    verificationStatus: 'UNVERIFIED',
    mustChangePassword: false
  },
  {
    role: 'FACULTY',
    name: 'Professor Faculty',
    email: 'faculty@proctornet.edu',
    password: 'Faculty#2026_SecureExams!',
    status: 'ACTIVE',
    verificationStatus: 'UNVERIFIED',
    mustChangePassword: false,
    department: 'Computer Science and Engineering',
    employeeId: 'FAC-2026-001',
    designation: 'Associate Professor'
  },
  {
    role: 'STUDENT',
    name: 'Sudeep Shankaranarayana Kagi',
    email: 'sudeep@proctornet.edu',
    password: 'Student#2026_SecureExams!',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED',
    mustChangePassword: false,
    enrollmentNumber: 'CS2026-001',
    department: 'Computer Science and Engineering',
    semester: 6,
    enrolledFacePhotoUrl: SUDEEP_MOCK_S3_URL
  }
];

/**
 * Creates a valid synthetic JPEG face image buffer for S3 upload.
 */
function createSyntheticFaceJpeg() {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01]);
  const body = Buffer.alloc(4096);
  for (let i = 0; i < body.length; i++) {
    body[i] = ((i * 19) + 42) % 256;
  }
  return Buffer.concat([header, body]);
}

/**
 * Ensures the target S3 bucket exists and uploads Sudeep's reference photo.
 */
async function seedS3ReferencePhoto() {
  console.log(`[S3 Seed] Checking bucket ${S3_BUCKET}...`);
  try {
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    } catch {
      await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
      console.log(`[S3 Seed] Created bucket ${S3_BUCKET}`);
    }

    const faceBuffer = createSyntheticFaceJpeg();
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: SUDEEP_REFERENCE_KEY,
      Body: faceBuffer,
      ContentType: 'image/jpeg',
      ContentLength: faceBuffer.length
    }));
    console.log(`[S3 Seed] ✓ Uploaded student reference image to s3://${S3_BUCKET}/${SUDEEP_REFERENCE_KEY}`);
  } catch (err) {
    console.warn(`[S3 Seed] S3 upload skipped or not available locally: ${err.message}`);
  }
}

async function resetAndSeed() {
  console.log('================================================================');
  console.log('PROCTORNET: DATABASE RESET & CLEAN 4-ROLE SEED');
  console.log('================================================================');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Ensure columns exist on users and student_profiles
    console.log('[Seed] Ensuring schema columns exist...');
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS enrolled_face_photo_url TEXT;
      ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS enrolled_face_photo_url TEXT;
    `);

    // 2. Temporarily disable audit log immutability triggers for full purge
    console.log('[Seed] Temporarily disabling audit triggers...');
    try {
      await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable;');
      await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_truncate;');
    } catch (e) {
      // Trigger may not exist on fresh schema
    }

    // 3. Truncate all tables with CASCADE
    console.log('[Seed] Purging all database tables with TRUNCATE CASCADE...');
    await client.query(`
      TRUNCATE TABLE
        answers,
        attempt_questions,
        audit_logs,
        biometric_verifications,
        evidence_records,
        exam_attempts,
        exam_questions,
        exam_sessions,
        exams,
        face_biometrics,
        faculty_profiles,
        liveness_challenges,
        manual_grade_audits,
        manual_grades,
        outbox_events,
        proctor_interventions,
        question_banks,
        question_options,
        questions,
        results,
        rooms,
        session_invigilators,
        session_students,
        student_configurations,
        student_identity_documents,
        student_profiles,
        subjects,
        submission_idempotency,
        topics,
        user_roles,
        user_sessions,
        users,
        violation_events,
        violation_flags
      CASCADE;
    `);

    // 4. Re-enable audit immutability triggers
    try {
      await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable;');
      await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_truncate;');
    } catch (e) {}

    console.log('[Seed] Provisioning 4 evaluation accounts in UNVERIFIED state...');

    const createdUsers = {};

    for (const acc of SEED_ACCOUNTS) {
      const passwordHash = await bcrypt.hash(acc.password, 10);
      const userId = crypto.randomUUID();

      // Insert User with UNVERIFIED status
      const userRes = await client.query(
        `INSERT INTO users (
           user_id,
           name,
           email,
           password_hash,
           status,
           verification_status,
           must_change_password,
           enrolled_face_photo_url,
           failed_login_attempts
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
         RETURNING user_id, email, name, status, verification_status;`,
        [
          userId,
          acc.name,
          acc.email,
          passwordHash,
          acc.status,
          acc.verificationStatus,
          acc.mustChangePassword,
          acc.enrolledFacePhotoUrl || null
        ]
      );

      const user = userRes.rows[0];
      createdUsers[acc.role] = user;

      // Assign User Role
      await client.query(
        `INSERT INTO user_roles (user_id, role)
         VALUES ($1, $2);`,
        [user.user_id, acc.role]
      );

      // Provision Faculty Profile if role is FACULTY
      if (acc.role === 'FACULTY') {
        await client.query(
          `INSERT INTO faculty_profiles (user_id, employee_id, department, designation)
           VALUES ($1, $2, $3, $4);`,
          [user.user_id, acc.employeeId, acc.department, acc.designation]
        );
      }

      // Provision Student Profile and Reference Face Biometric if role is STUDENT
      if (acc.role === 'STUDENT') {
        const metadata = {
          enrolledFacePhotoUrl: acc.enrolledFacePhotoUrl || null,
          referenceImage: acc.enrolledFacePhotoUrl ? SUDEEP_REFERENCE_KEY : null,
          enrolledVia: 'DATABASE_SEED'
        };

        await client.query(
          `INSERT INTO student_profiles (user_id, enrollment_number, department, semester, metadata, enrolled_face_photo_url)
           VALUES ($1, $2, $3, $4, $5, $6);`,
          [
            user.user_id,
            acc.enrollmentNumber,
            acc.department,
            acc.semester,
            JSON.stringify(metadata),
            acc.enrolledFacePhotoUrl || null
          ]
        );

        // Only seed face_biometrics if reference photo URL is provided
        if (acc.enrolledFacePhotoUrl) {
          const biometricId = crypto.randomUUID();
          await client.query(
            `INSERT INTO face_biometrics (
               biometric_id,
               user_id,
               enrollment_status,
               s3_bucket,
               s3_key,
               quality_score,
               mime_type,
               byte_size,
               model_version
             )
             VALUES ($1, $2, 'ENROLLED', $3, $4, 0.950, 'image/jpeg', 4096, 'facenet-v1');`,
            [
              biometricId,
              user.user_id,
              S3_BUCKET,
              SUDEEP_REFERENCE_KEY
            ]
          );

          console.log(`[Seed] ✓ Provisioned student face biometric reference pointing to ${SUDEEP_MOCK_S3_URL}`);
        } else {
          console.log(`[Seed] ✓ Student created without face biometric reference (un-enrolled state for onboarding testing)`);
        }
      }

      console.log(`[Seed] ✓ Created [${acc.role}] Account: ${acc.email} (verification_status: ${acc.verificationStatus})`);
    }

    // 5. Update organization settings to point to Admin user
    if (createdUsers.ADMIN) {
      await client.query(`
        UPDATE organization_settings
        SET updated_by = $1, updated_at = NOW();
      `, [createdUsers.ADMIN.user_id]);
    }

    // 6. Provision an Active Test Examination and Session for Sudeep
    console.log('[Seed] Provisioning test subject, topics, exam, and active session...');
    const subjectRes = await client.query(`
      INSERT INTO subjects (code, name, description)
      VALUES ('CS601', 'Computer Networks & Security (CNS)', 'Network protocols, TCP/IP, cryptography, and network security.')
      RETURNING subject_id;
    `);
    const subjectId = subjectRes.rows[0].subject_id;

    const topicRes = await client.query(`
      INSERT INTO topics (subject_id, name, description)
      VALUES ($1, 'Network Security Protocols', 'SSL/TLS, IPsec, Kerberos, and Cryptographic Ciphers')
      RETURNING topic_id;
    `, [subjectId]);
    const topicId = topicRes.rows[0].topic_id;

    const facultyId = createdUsers.FACULTY.user_id;
    const examRes = await client.query(`
      INSERT INTO exams (
        subject_id,
        created_by,
        title,
        description,
        duration_minutes,
        total_marks,
        passing_marks,
        target_department,
        target_semester,
        status,
        pool_id
      )
      VALUES (
        $1, $2,
        'Computer Networks & Security (CNS)',
        'Midterm examination on network security protocols, cryptography, and secure architectures.',
        60,
        100,
        40,
        'Computer Science and Engineering',
        6,
        'PUBLISHED',
        $3
      )
      RETURNING exam_id;
    `, [subjectId, facultyId, topicId]);
    const examId = examRes.rows[0].exam_id;

    // Insert sample questions
    const q1Res = await client.query(`
      INSERT INTO questions (
        topic_id,
        question_type,
        prompt_text,
        default_points
      )
      VALUES (
        $1,
        'MCQ',
        'Which symmetric cipher uses a 128-bit block size and key sizes of 128, 192, or 256 bits?',
        5.00
      )
      RETURNING question_id;
    `, [topicId]);
    const q1Id = q1Res.rows[0].question_id;

    await client.query(`
      INSERT INTO question_options (question_id, option_text, is_correct, display_order)
      VALUES
        ($1, 'DES', FALSE, 1),
        ($1, 'AES (Advanced Encryption Standard)', TRUE, 2),
        ($1, 'RSA', FALSE, 3),
        ($1, 'RC4', FALSE, 4);
    `, [q1Id]);

    const q2Res = await client.query(`
      INSERT INTO questions (
        topic_id,
        question_type,
        prompt_text,
        default_points
      )
      VALUES (
        $1,
        'MCQ',
        'In TLS 1.3, which key exchange mechanism provides Perfect Forward Secrecy (PFS)?',
        5.00
      )
      RETURNING question_id;
    `, [topicId]);
    const q2Id = q2Res.rows[0].question_id;

    await client.query(`
      INSERT INTO question_options (question_id, option_text, is_correct, display_order)
      VALUES
        ($1, 'Static RSA Key Exchange', FALSE, 1),
        ($1, 'Ephemeral Diffie-Hellman (ECDHE)', TRUE, 2),
        ($1, 'Pre-Shared Key with DES', FALSE, 3),
        ($1, 'MD5 Message Digest', FALSE, 4);
    `, [q2Id]);

    const q3Res = await client.query(`
      INSERT INTO questions (
        topic_id,
        question_type,
        prompt_text,
        default_points
      )
      VALUES (
        $1,
        'MCQ',
        'Which cryptographic hash algorithm produces a 256-bit digest and belongs to the SHA-2 family?',
        5.00
      )
      RETURNING question_id;
    `, [topicId]);
    const q3Id = q3Res.rows[0].question_id;

    await client.query(`
      INSERT INTO question_options (question_id, option_text, is_correct, display_order)
      VALUES
        ($1, 'SHA-1', FALSE, 1),
        ($1, 'SHA-256', TRUE, 2),
        ($1, 'MD5', FALSE, 3),
        ($1, 'CRC32', FALSE, 4);
    `, [q3Id]);

    // Statically assign all questions to the exam (all students get identical questions)
    await client.query(`
      INSERT INTO exam_questions (exam_id, question_id, display_order, points)
      VALUES 
        ($1, $2, 1, 5.00),
        ($1, $3, 2, 5.00),
        ($1, $4, 3, 5.00)
      ON CONFLICT (exam_id, question_id) DO NOTHING;
    `, [examId, q1Id, q2Id, q3Id]);

    // Insert Room and Active Session
    const roomRes = await client.query(`
      INSERT INTO rooms (name, capacity, building)
      VALUES ('Virtual Exam Lab 1', 100, 'Online Portal')
      RETURNING room_id;
    `);
    const roomId = roomRes.rows[0].room_id;

    const sessionStartTime = new Date(Date.now() - 10 * 60 * 1000); // Started 10 min ago
    const sessionEndTime = new Date(Date.now() + 180 * 60 * 1000);  // Ends in 3 hours
    const sessionRes = await client.query(`
      INSERT INTO exam_sessions (
        exam_id,
        room_id,
        scheduled_start_time,
        scheduled_end_time,
        status,
        target_department,
        target_semester
      )
      VALUES (
        $1, $2, $3, $4, 'ACTIVE', 'Computer Science and Engineering', 6
      )
      RETURNING session_id;
    `, [examId, roomId, sessionStartTime, sessionEndTime]);
    const sessionId = sessionRes.rows[0].session_id;

    // Assign Sudeep to this session
    await client.query(`
      INSERT INTO session_students (session_id, student_id, status)
      VALUES ($1, $2, 'ASSIGNED');
    `, [sessionId, createdUsers.STUDENT.user_id]);

    await client.query('COMMIT');
    console.log('[Seed] PostgreSQL transaction committed successfully.');

    // 7. Seed S3 image
    await seedS3ReferencePhoto();

    console.log('\n================================================================');
    console.log('PROCTORNET SEED COMPLETE — NEW CREDENTIALS (ALL UNVERIFIED)');
    console.log('================================================================');
    console.table([
      { Role: 'ADMIN', Email: 'admin@proctornet.edu', Password: 'Admin#2026_SecureExams!', Verified: 'false' },
      { Role: 'DEVELOPER', Email: 'dev@proctornet.edu', Password: 'Dev#2026_SecureExams!', Verified: 'false' },
      { Role: 'FACULTY', Email: 'faculty@proctornet.edu', Password: 'Faculty#2026_SecureExams!', Verified: 'false' },
      { Role: 'STUDENT (Sudeep)', Email: 'sudeep@proctornet.edu', Password: 'Student#2026_SecureExams!', Verified: 'false' }
    ]);
    console.log(`\nActive Exam Session ID for Sudeep: ${sessionId}`);
    console.log(`Student S3 Reference Image URL:   ${SUDEEP_MOCK_S3_URL}`);
    console.log('================================================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed] FATAL: Error during reset and seed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

resetAndSeed()
  .then(() => {
    console.log('[Seed] Execution finished successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Seed] Execution failed:', err);
    process.exit(1);
  });

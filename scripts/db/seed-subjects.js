/**
 * @file seed-subjects.js
 * @description Seeds the subjects table with standard academic subjects.
 * Run with: node scripts/db/seed-subjects.js
 */

import { getPool } from '../../backend/src/infrastructure/postgres/pool.js';

const pool = getPool();

const SUBJECTS = [
  { code: 'CS101', name: 'Introduction to Computer Science', description: 'Fundamentals of computing, algorithms, and programming logic.' },
  { code: 'CS201', name: 'Data Structures & Algorithms', description: 'Arrays, linked lists, trees, graphs, sorting, and searching.' },
  { code: 'CS301', name: 'Operating Systems', description: 'Process management, concurrency, memory management, and file systems.' },
  { code: 'CS401', name: 'Database Management Systems', description: 'Relational databases, SQL, normalization, and transactions.' },
  { code: 'CS501', name: 'Computer Networks', description: 'Network protocols, TCP/IP, routing, and security fundamentals.' },
  { code: 'CS601', name: 'Software Engineering', description: 'SDLC, design patterns, testing, and project management.' },
  { code: 'CS701', name: 'Artificial Intelligence', description: 'Search algorithms, knowledge representation, and machine learning.' },
  { code: 'CS801', name: 'Machine Learning', description: 'Supervised and unsupervised learning, neural networks, and model evaluation.' },
  { code: 'CS901', name: 'Cybersecurity Fundamentals', description: 'Threat models, cryptography, network security, and compliance.' },
  { code: 'MATH101', name: 'Calculus I', description: 'Limits, derivatives, integrals, and applications.' },
  { code: 'MATH201', name: 'Linear Algebra', description: 'Matrices, vector spaces, eigenvalues, and linear transformations.' },
  { code: 'MATH301', name: 'Discrete Mathematics', description: 'Logic, sets, combinatorics, graph theory, and proofs.' },
  { code: 'MATH401', name: 'Probability & Statistics', description: 'Probability theory, distributions, hypothesis testing, and regression.' },
  { code: 'PHY101', name: 'Engineering Physics', description: 'Mechanics, thermodynamics, electromagnetism, and optics.' },
  { code: 'CHM101', name: 'Engineering Chemistry', description: 'Atomic structure, bonding, thermodynamics, and chemical kinetics.' },
  { code: 'ECE201', name: 'Digital Electronics', description: 'Boolean algebra, logic gates, flip-flops, and sequential circuits.' },
  { code: 'ECE301', name: 'Signals & Systems', description: 'Fourier analysis, Laplace transforms, and system response.' },
  { code: 'ME201', name: 'Engineering Mechanics', description: 'Statics, dynamics, stress, and strain analysis.' },
  { code: 'ENG101', name: 'Technical Communication', description: 'Report writing, presentations, and professional documentation.' },
];

async function seedSubjects() {
  console.log('Seeding subjects...');
  let inserted = 0;
  let skipped = 0;

  for (const subject of SUBJECTS) {
    try {
      await pool.query(
        `INSERT INTO subjects (code, name, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO NOTHING`,
        [subject.code, subject.name, subject.description]
      );
      inserted++;
      console.log(`  ✓ ${subject.code}: ${subject.name}`);
    } catch (err) {
      console.error(`  ✗ Failed to insert ${subject.code}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\nDone. Inserted: ${inserted}, Skipped/Conflicted: ${skipped}`);
  await pool.end();
}

seedSubjects().catch((err) => {
  console.error('Seeding failed:', err);
  pool.end();
  process.exit(1);
});

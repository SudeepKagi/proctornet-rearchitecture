import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { checkDatabaseHealth, closePool, query } from '../../src/infrastructure/postgres/pool.js';
import { closeRedis } from '../../src/infrastructure/redis/client.js';
import * as questionsService from '../../src/modules/questions/questions.service.js';
import { ForbiddenError, NotFoundError } from '../../src/utils/errors.js';

describe('Phase 26 Workstream A: Question Bank & Rich Question Authoring', () => {
  let dbAvailable = false;
  let facultyAId = null;
  let facultyBId = null;
  let studentId = null;
  let subjectId = null;
  let topicId = null;

  before(async () => {
    const health = await checkDatabaseHealth(2000);
    dbAvailable = health.healthy;
    if (!dbAvailable) return;

    // Create test faculty users
    const fARes = await query(`
      INSERT INTO users (email, password_hash, name, status)
      VALUES ('fac_a_phase26@test.com', 'hash', 'Faculty A Phase 26', 'ACTIVE')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING user_id;
    `);
    facultyAId = fARes.rows[0].user_id;

    await query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'FACULTY')
      ON CONFLICT (user_id, role) DO NOTHING;
    `, [facultyAId]);

    const fBRes = await query(`
      INSERT INTO users (email, password_hash, name, status)
      VALUES ('fac_b_phase26@test.com', 'hash', 'Faculty B Phase 26', 'ACTIVE')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING user_id;
    `);
    facultyBId = fBRes.rows[0].user_id;

    await query(`
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, 'FACULTY')
      ON CONFLICT (user_id, role) DO NOTHING;
    `, [facultyBId]);

    // Create subject and topic
    const subRes = await query(`
      INSERT INTO subjects (name, code, description)
      VALUES ('Computer Networks Phase 26', 'CS2601', 'Test Subject')
      RETURNING subject_id;
    `);
    subjectId = subRes.rows[0].subject_id;

    const topRes = await query(`
      INSERT INTO topics (subject_id, name, description)
      VALUES ($1, 'Transport Layer Protocols', 'TCP, UDP, Congestion Control')
      RETURNING topic_id;
    `, [subjectId]);
    topicId = topRes.rows[0].topic_id;
  });

  after(async () => {
    if (dbAvailable) {
      if (topicId) {
        await query('DELETE FROM questions WHERE topic_id = $1', [topicId]).catch(() => {});
        await query('DELETE FROM topics WHERE topic_id = $1', [topicId]).catch(() => {});
      }
      if (subjectId) {
        await query('DELETE FROM question_banks WHERE subject_id = $1', [subjectId]).catch(() => {});
        await query('DELETE FROM subjects WHERE subject_id = $1', [subjectId]).catch(() => {});
      }
      if (facultyAId) await query('DELETE FROM users WHERE user_id = $1', [facultyAId]).catch(() => {});
      if (facultyBId) await query('DELETE FROM users WHERE user_id = $1', [facultyBId]).catch(() => {});
    }
    await closeRedis();
    await closePool();
  });

  describe('Question Bank CRUD & Ownership Isolation', () => {
    let bankAId = null;

    it('should allow faculty to create a question bank', async () => {
      if (!dbAvailable) return;

      const bank = await questionsService.createBank(facultyAId, {
        title: 'Algorithms & Data Structures Bank',
        description: 'Comprehensive question set for CS2601',
        subject_id: subjectId,
        is_shared: false
      });

      assert.ok(bank.bank_id);
      assert.equal(bank.created_by, facultyAId);
      assert.equal(bank.title, 'Algorithms & Data Structures Bank');
      assert.equal(bank.is_shared, false);
      bankAId = bank.bank_id;
    });

    it('should list question banks for creator', async () => {
      if (!dbAvailable) return;

      const banks = await questionsService.listBanks(facultyAId, 'FACULTY', {});
      const found = banks.find(b => b.bank_id === bankAId);
      assert.ok(found, 'Faculty A should see their created bank');
      assert.equal(found.title, 'Algorithms & Data Structures Bank');
    });

    it('should enforce BOLA: prevent Faculty B from reading private bank of Faculty A', async () => {
      if (!dbAvailable) return;

      await assert.rejects(
        () => questionsService.getBank(bankAId, facultyBId, 'FACULTY'),
        (err) => err instanceof ForbiddenError
      );
    });

    it('should enforce BOLA: prevent Faculty B from modifying bank of Faculty A', async () => {
      if (!dbAvailable) return;

      await assert.rejects(
        () => questionsService.updateBank(bankAId, facultyBId, 'FACULTY', { title: 'Hijacked Title' }),
        (err) => err instanceof ForbiddenError
      );
    });

    it('should allow Faculty A to update their question bank and make it shared', async () => {
      if (!dbAvailable) return;

      const updated = await questionsService.updateBank(bankAId, facultyAId, 'FACULTY', {
        title: 'Shared Transport Layer Bank',
        is_shared: true
      });

      assert.equal(updated.title, 'Shared Transport Layer Bank');
      assert.equal(updated.is_shared, true);

      // Now Faculty B should be able to view it because is_shared = true
      const viewByB = await questionsService.getBank(bankAId, facultyBId, 'FACULTY');
      assert.equal(viewByB.bank_id, bankAId);
    });
  });

  describe('Rich Question Authoring & Subjective Question Lifecycle', () => {
    let questionId = null;
    let bankId = null;

    before(async () => {
      if (!dbAvailable) return;
      const bank = await questionsService.createBank(facultyAId, {
        title: 'Core Question Bank',
        subject_id: subjectId,
        is_shared: true
      });
      bankId = bank.bank_id;
    });

    it('should author MCQ with LaTeX / MathJax formulas in prompt', async () => {
      if (!dbAvailable) return;

      const question = await questionsService.createQuestion(facultyAId, 'FACULTY', {
        bank_id: bankId,
        topic_id: topicId,
        question_type: 'MCQ',
        prompt_text: 'What is the throughput formula \\( T = \\frac{W \\times MSS}{RTT \\times \\sqrt{p}} \\)?',
        default_points: 2.0,
        difficulty: 'MEDIUM',
        bloom_level: 'APPLY',
        tags: ['tcp', 'mathjax', 'networking'],
        options: [
          { option_text: 'Mathis TCP Throughput Equation', is_correct: true, display_order: 0 },
          { option_text: 'Little Law', is_correct: false, display_order: 1 },
          { option_text: 'Shannon-Hartley Theorem', is_correct: false, display_order: 2 }
        ],
        metadata: { hasLatex: true }
      });

      assert.ok(question.question_id);
      assert.equal(question.question_type, 'MCQ');
      assert.equal(question.difficulty, 'MEDIUM');
      assert.equal(question.bloom_level, 'APPLY');
      assert.equal(question.version, 1);
      assert.equal(question.options.length, 3);
    });

    it('should author a subjective CODE question with rubric definition', async () => {
      if (!dbAvailable) return;

      const codeQ = await questionsService.createQuestion(facultyAId, 'FACULTY', {
        bank_id: bankId,
        topic_id: topicId,
        question_type: 'CODE',
        prompt_text: 'Implement a sliding window flow control receiver in Python.',
        default_points: 10.0,
        difficulty: 'HARD',
        bloom_level: 'CREATE',
        tags: ['coding', 'python', 'sliding-window'],
        rubric: {
          criteria: [
            { id: 'seq_ack', name: 'Sequence & ACK Handling', max_points: 5.0 },
            { id: 'buffer_mgmt', name: 'Out-of-order Buffer Management', max_points: 3.0 },
            { id: 'code_quality', name: 'Code Quality & Cleanliness', max_points: 2.0 }
          ],
          max_points: 10.0
        },
        metadata: {
          language: 'python',
          starter_code: 'def receive_frame(frame, window):\n    pass\n'
        }
      });

      assert.ok(codeQ.question_id);
      assert.equal(codeQ.question_type, 'CODE');
      assert.equal(codeQ.difficulty, 'HARD');
      assert.equal(codeQ.bloom_level, 'CREATE');
      assert.equal(codeQ.rubric.criteria.length, 3);
      questionId = codeQ.question_id;
    });

    it('should author a subjective ESSAY question with guidelines', async () => {
      if (!dbAvailable) return;

      const essayQ = await questionsService.createQuestion(facultyAId, 'FACULTY', {
        bank_id: bankId,
        topic_id: topicId,
        question_type: 'ESSAY',
        prompt_text: 'Critically analyze the trade-offs between TCP BBR and Cubic congestion control.',
        default_points: 15.0,
        difficulty: 'HARD',
        bloom_level: 'EVALUATE',
        tags: ['essay', 'congestion-control'],
        rubric: {
          analysis: 8.0,
          empirical_evidence: 4.0,
          clarity: 3.0
        }
      });

      assert.ok(essayQ.question_id);
      assert.equal(essayQ.question_type, 'ESSAY');
      assert.equal(Number(essayQ.default_points), 15.0);
    });

    it('should search questions with multi-criteria filters', async () => {
      if (!dbAvailable) return;

      const searchRes = await questionsService.searchQuestions(facultyAId, 'FACULTY', {
        bank_id: bankId,
        difficulty: 'HARD',
        question_type: 'CODE'
      });

      assert.equal(searchRes.questions.length, 1);
      assert.equal(searchRes.questions[0].question_id, questionId);
      assert.equal(searchRes.pagination.total, 1);
    });

    it('should update question and atomically increment version', async () => {
      if (!dbAvailable) return;

      const updated = await questionsService.updateQuestion(
        questionId,
        facultyAId,
        'FACULTY',
        {
          prompt_text: 'Implement an enhanced sliding window receiver in Python 3.12.'
        }
      );

      assert.equal(updated.prompt_text, 'Implement an enhanced sliding window receiver in Python 3.12.');
      assert.equal(updated.version, 2, 'Version should increment from 1 to 2');
    });

    it('should clone question into a draft copy with parent linkage', async () => {
      if (!dbAvailable) return;

      const cloned = await questionsService.cloneQuestion(
        questionId,
        facultyAId,
        'FACULTY',
        {
          prompt_text: 'Implement a selective repeat receiver in Python.'
        }
      );

      assert.ok(cloned.question_id);
      assert.notEqual(cloned.question_id, questionId);
      assert.equal(cloned.parent_question_id, questionId);
      assert.equal(cloned.status, 'DRAFT');
      assert.equal(cloned.version, 1);
      assert.equal(cloned.prompt_text, 'Implement a selective repeat receiver in Python.');
    });

    it('should archive question', async () => {
      if (!dbAvailable) return;

      const archived = await questionsService.archiveQuestion(questionId, facultyAId, 'FACULTY');
      assert.equal(archived.status, 'ARCHIVED');

      // Search without status should exclude archived
      const searchRes = await questionsService.searchQuestions(facultyAId, 'FACULTY', {
        bank_id: bankId,
        question_type: 'CODE'
      });
      assert.equal(searchRes.questions.length, 0);
    });
  });
});

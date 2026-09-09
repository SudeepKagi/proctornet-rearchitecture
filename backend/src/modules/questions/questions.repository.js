/**
 * @file questions.repository.js
 * @description PostgreSQL database repository for Question Banks and Questions.
 * Conforms to Phase 26 Track 1 Workstream A.
 */

import { query, getPool } from '../../infrastructure/postgres/pool.js';

// ==========================================
// Question Bank Methods
// ==========================================

export async function createBank({ created_by, title, description, subject_id, is_shared = false }) {
  const sql = `
    INSERT INTO question_banks (created_by, title, description, subject_id, is_shared)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const res = await query(sql, [created_by, title, description || null, subject_id || null, is_shared]);
  return res.rows[0];
}

export async function findBankById(bankId) {
  const sql = `
    SELECT qb.*, s.name as subject_name, u.name as creator_name,
           COUNT(q.question_id)::int as question_count
    FROM question_banks qb
    LEFT JOIN subjects s ON qb.subject_id = s.subject_id
    LEFT JOIN users u ON qb.created_by = u.user_id
    LEFT JOIN questions q ON qb.bank_id = q.bank_id AND q.status != 'ARCHIVED'
    WHERE qb.bank_id = $1
    GROUP BY qb.bank_id, s.name, u.name;
  `;
  const res = await query(sql, [bankId]);
  return res.rows[0] || null;
}

export async function listBanksForUser(userId, { subject_id, is_shared } = {}) {
  const params = [userId];
  let filterClauses = '(qb.created_by = $1 OR qb.is_shared = TRUE)';

  if (subject_id) {
    params.push(subject_id);
    filterClauses += ` AND qb.subject_id = $${params.length}`;
  }

  if (typeof is_shared === 'boolean') {
    params.push(is_shared);
    filterClauses += ` AND qb.is_shared = $${params.length}`;
  }

  const sql = `
    SELECT qb.*, s.name as subject_name, u.name as creator_name,
           COUNT(q.question_id)::int as question_count
    FROM question_banks qb
    LEFT JOIN subjects s ON qb.subject_id = s.subject_id
    LEFT JOIN users u ON qb.created_by = u.user_id
    LEFT JOIN questions q ON qb.bank_id = q.bank_id AND q.status != 'ARCHIVED'
    WHERE ${filterClauses}
    GROUP BY qb.bank_id, s.name, u.name
    ORDER BY qb.updated_at DESC;
  `;
  const res = await query(sql, params);
  return res.rows;
}

export async function updateBank(bankId, fields) {
  const setClauses = [];
  const params = [bankId];

  const allowed = ['title', 'description', 'subject_id', 'is_shared'];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      setClauses.push(`${key} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return findBankById(bankId);
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');

  const sql = `
    UPDATE question_banks
    SET ${setClauses.join(', ')}
    WHERE bank_id = $1
    RETURNING *;
  `;
  const res = await query(sql, params);
  return res.rows[0] || null;
}

export async function deleteBank(bankId) {
  const sql = `DELETE FROM question_banks WHERE bank_id = $1 RETURNING bank_id;`;
  const res = await query(sql, [bankId]);
  return res.rows[0] || null;
}

// ==========================================
// Question Methods
// ==========================================

export async function createQuestion(data, optionalClient = null) {
  const pool = getPool();
  const client = optionalClient || (await pool.connect());
  const shouldManageTx = !optionalClient;

  try {
    if (shouldManageTx) {
      await client.query('BEGIN');
    }

    const insertSql = `
      INSERT INTO questions (
        bank_id, topic_id, question_type, prompt_text, default_points,
        difficulty, bloom_level, tags, status, correct_numeric_value,
        rubric, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;

    const values = [
      data.bank_id || null,
      data.topic_id,
      data.question_type,
      data.prompt_text,
      data.default_points || 1.0,
      data.difficulty || 'MEDIUM',
      data.bloom_level || 'REMEMBER',
      data.tags || [],
      data.status || 'PUBLISHED',
      data.correct_numeric_value !== undefined ? data.correct_numeric_value : null,
      data.rubric || {},
      data.metadata || {}
    ];

    const qRes = await client.query(insertSql, values);
    const createdQuestion = qRes.rows[0];

    // Insert options if provided
    createdQuestion.options = [];
    if (Array.isArray(data.options) && data.options.length > 0) {
      for (let i = 0; i < data.options.length; i++) {
        const opt = data.options[i];
        const optSql = `
          INSERT INTO question_options (question_id, option_text, is_correct, display_order)
          VALUES ($1, $2, $3, $4)
          RETURNING *;
        `;
        const optRes = await client.query(optSql, [
          createdQuestion.question_id,
          opt.option_text,
          Boolean(opt.is_correct),
          opt.display_order !== undefined ? opt.display_order : i
        ]);
        createdQuestion.options.push(optRes.rows[0]);
      }
    }

    if (shouldManageTx) {
      await client.query('COMMIT');
    }

    return createdQuestion;
  } catch (err) {
    if (shouldManageTx) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw err;
  } finally {
    if (shouldManageTx) {
      client.release();
    }
  }
}

export async function findQuestionById(questionId) {
  const sql = `
    SELECT q.*, t.name as topic_name, t.subject_id, s.name as subject_name,
           qb.title as bank_title, qb.created_by as bank_created_by, qb.is_shared as bank_is_shared
    FROM questions q
    JOIN topics t ON q.topic_id = t.topic_id
    JOIN subjects s ON t.subject_id = s.subject_id
    LEFT JOIN question_banks qb ON q.bank_id = qb.bank_id
    WHERE q.question_id = $1;
  `;
  const res = await query(sql, [questionId]);
  if (!res.rows[0]) return null;

  const question = res.rows[0];
  const optSql = `
    SELECT * FROM question_options
    WHERE question_id = $1
    ORDER BY display_order ASC, created_at ASC;
  `;
  const optRes = await query(optSql, [questionId]);
  question.options = optRes.rows;

  return question;
}

export async function searchQuestions(filters, { limit = 20, offset = 0 } = {}) {
  const params = [];
  const whereClauses = [];

  if (filters.bank_id) {
    params.push(filters.bank_id);
    whereClauses.push(`q.bank_id = $${params.length}`);
  }

  if (filters.subject_id) {
    params.push(filters.subject_id);
    whereClauses.push(`t.subject_id = $${params.length}`);
  }

  if (filters.topic_id) {
    params.push(filters.topic_id);
    whereClauses.push(`q.topic_id = $${params.length}`);
  }

  if (filters.difficulty) {
    params.push(filters.difficulty);
    whereClauses.push(`q.difficulty = $${params.length}`);
  }

  if (filters.bloom_level) {
    params.push(filters.bloom_level);
    whereClauses.push(`q.bloom_level = $${params.length}`);
  }

  if (filters.question_type) {
    params.push(filters.question_type);
    whereClauses.push(`q.question_type = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    whereClauses.push(`q.status = $${params.length}`);
  } else {
    whereClauses.push(`q.status != 'ARCHIVED'`);
  }

  if (filters.tag) {
    params.push(filters.tag);
    whereClauses.push(`$${params.length} = ANY(q.tags)`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    whereClauses.push(`q.prompt_text ILIKE $${params.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const sql = `
    SELECT q.*, t.name as topic_name, t.subject_id, s.name as subject_name,
           qb.title as bank_title
    FROM questions q
    JOIN topics t ON q.topic_id = t.topic_id
    JOIN subjects s ON t.subject_id = s.subject_id
    LEFT JOIN question_banks qb ON q.bank_id = qb.bank_id
    ${whereSql}
    ORDER BY q.created_at DESC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;

  const res = await query(sql, params);
  return res.rows;
}

export async function countQuestions(filters) {
  const params = [];
  const whereClauses = [];

  if (filters.bank_id) {
    params.push(filters.bank_id);
    whereClauses.push(`q.bank_id = $${params.length}`);
  }

  if (filters.subject_id) {
    params.push(filters.subject_id);
    whereClauses.push(`t.subject_id = $${params.length}`);
  }

  if (filters.topic_id) {
    params.push(filters.topic_id);
    whereClauses.push(`q.topic_id = $${params.length}`);
  }

  if (filters.difficulty) {
    params.push(filters.difficulty);
    whereClauses.push(`q.difficulty = $${params.length}`);
  }

  if (filters.bloom_level) {
    params.push(filters.bloom_level);
    whereClauses.push(`q.bloom_level = $${params.length}`);
  }

  if (filters.question_type) {
    params.push(filters.question_type);
    whereClauses.push(`q.question_type = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    whereClauses.push(`q.status = $${params.length}`);
  } else {
    whereClauses.push(`q.status != 'ARCHIVED'`);
  }

  if (filters.tag) {
    params.push(filters.tag);
    whereClauses.push(`$${params.length} = ANY(q.tags)`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    whereClauses.push(`q.prompt_text ILIKE $${params.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT COUNT(q.question_id)::int as total
    FROM questions q
    JOIN topics t ON q.topic_id = t.topic_id
    JOIN subjects s ON t.subject_id = s.subject_id
    ${whereSql};
  `;

  const res = await query(sql, params);
  return res.rows[0]?.total || 0;
}

export async function updateQuestion(questionId, data) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const setClauses = ['version = version + 1'];
    const params = [questionId];

    const directFields = [
      'topic_id', 'prompt_text', 'default_points', 'difficulty',
      'bloom_level', 'tags', 'status', 'correct_numeric_value',
      'rubric', 'metadata'
    ];

    for (const key of directFields) {
      if (data[key] !== undefined) {
        params.push(data[key]);
        setClauses.push(`${key} = $${params.length}`);
      }
    }

    const sql = `
      UPDATE questions
      SET ${setClauses.join(', ')}
      WHERE question_id = $1
      RETURNING *;
    `;

    const res = await client.query(sql, params);
    const updated = res.rows[0];

    // If options were passed, replace options
    if (Array.isArray(data.options)) {
      await client.query(`DELETE FROM question_options WHERE question_id = $1`, [questionId]);
      updated.options = [];
      for (let i = 0; i < data.options.length; i++) {
        const opt = data.options[i];
        const optRes = await client.query(
          `INSERT INTO question_options (question_id, option_text, is_correct, display_order)
           VALUES ($1, $2, $3, $4) RETURNING *;`,
          [questionId, opt.option_text, Boolean(opt.is_correct), opt.display_order !== undefined ? opt.display_order : i]
        );
        updated.options.push(optRes.rows[0]);
      }
    }

    await client.query('COMMIT');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function archiveQuestion(questionId) {
  const sql = `
    UPDATE questions
    SET status = 'ARCHIVED'
    WHERE question_id = $1
    RETURNING *;
  `;
  const res = await query(sql, [questionId]);
  return res.rows[0] || null;
}

export async function cloneQuestion(sourceQuestionId, { target_bank_id = null, prompt_text = null } = {}) {
  const source = await findQuestionById(sourceQuestionId);
  if (!source) return null;

  const cloneData = {
    bank_id: target_bank_id !== undefined ? target_bank_id : source.bank_id,
    topic_id: source.topic_id,
    question_type: source.question_type,
    prompt_text: prompt_text || `[Copy] ${source.prompt_text}`,
    default_points: Number(source.default_points),
    difficulty: source.difficulty,
    bloom_level: source.bloom_level,
    tags: source.tags,
    status: 'DRAFT',
    correct_numeric_value: source.correct_numeric_value !== null ? Number(source.correct_numeric_value) : null,
    rubric: source.rubric,
    metadata: { ...source.metadata, cloned_from: sourceQuestionId },
    options: (source.options || []).map(opt => ({
      option_text: opt.option_text,
      is_correct: opt.is_correct,
      display_order: opt.display_order
    }))
  };

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await createQuestion(cloneData, client);
    // Link parent_question_id
    await client.query(
      `UPDATE questions SET parent_question_id = $1 WHERE question_id = $2`,
      [sourceQuestionId, created.question_id]
    );
    created.parent_question_id = sourceQuestionId;
    await client.query('COMMIT');
    return created;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

import { query } from '../../src/infrastructure/postgres/pool.js';

async function reset() {
  const email = '1nt23ec158.sudeep@nmit.ac.in';
  const { rows } = await query('SELECT user_id FROM users WHERE email = $1', [email]);
  if (rows.length === 0) {
    console.log('User not found');
    process.exit(1);
  }
  const userId = rows[0].user_id;

  await query('DELETE FROM student_identity_documents WHERE user_id = $1', [userId]);
  await query('UPDATE users SET verification_status = $1 WHERE user_id = $2', ['UNVERIFIED', userId]);
  console.log(`Successfully reset identity document status for user ${userId} (${email}) to UNVERIFIED!`);
  process.exit(0);
}

reset().catch(err => {
  console.error(err);
  process.exit(1);
});

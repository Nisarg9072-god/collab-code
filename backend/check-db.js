import pool from './db.js';
async function run() {
  const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log('Tables:', r.rows.map(row => row.table_name));
  await pool.end();
}
run();

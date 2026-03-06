import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Configuration for Supabase PostgreSQL with SSL
let connectionString = process.env.DATABASE_URL;
try {
  const u = new URL(connectionString);
  // Avoid node-postgres treating sslmode=require as verify-full
  // We rely on explicit ssl config below.
  u.searchParams.delete("sslmode");
  connectionString = u.toString();
} catch {
  // leave as-is if URL parsing fails
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

// Verify connection and run test query
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Connected to Supabase PostgreSQL successfully!');
    
    const res = await client.query('SELECT NOW(), current_database(), current_user');
    console.log('📊 Connection details:', res.rows[0]);
    
    client.release();
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
  }
};

testConnection();

export default pool;

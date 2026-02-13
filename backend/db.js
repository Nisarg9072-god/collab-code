import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Configuration for Supabase PostgreSQL with SSL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Supabase/Heroku/Render
  }
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

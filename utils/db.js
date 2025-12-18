// utils/db.js
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// 1. Load variables from .env file into process.env
// dotenv by default does NOT overwrite existing process.env variables.
// This means if china-cdbu-test.py set DB_USER=china_app, dotenv should NOT overwrite it with 'postgres'.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 2. Debug Logging: Let's see exactly what the process sees
console.log('--- DB Connection Debug Info ---');
console.log(`process.env.DB_USER: ${process.env.DB_USER}`);
console.log(`process.env.DB_PASS: ${process.env.DB_PASSWORD ? '******' : 'undefined'}`);
console.log(`process.env.DB_NAME: ${process.env.DB_NAME}`);
console.log(`process.env.DB_DATABASE: ${process.env.DB_DATABASE}`);
console.log('--------------------------------');

// 3. Construct Config
// We prioritize the variables typically set by your Python runner (DB_NAME, DB_PASS)
// If those are missing, we look for the standard ones (DB_DATABASE, DB_PASSWORD) which might come from .env

// Logic to handle specific user password default if not provided
const dbUser = process.env.DB_USER || 'postgres';
let dbPassword = process.env.DB_PASS || process.env.DB_PASSWORD;

// CRITICAL FIX: Ensure correct password for china_app
// If the user is china_app, we almost certainly want 'admin@china_app',
// unless a very specific different password was passed in DB_PASS.
// If DB_PASS was not passed (undefined) OR if it picked up the default 'mysecretpassword' from .env, correct it.
if (dbUser === 'china_app') {
    if (!process.env.DB_PASSWORD || dbPassword === 'mysecretpassword') {
        console.log('🔒 Applying default password for china_app user.');
        dbPassword = 'admin_china_app';
    }
} else if (!dbPassword) {
    dbPassword = 'mysecretpassword';
}

const dbConfig = {
  user: dbUser, 
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || process.env.DB_DATABASE || 'qa_spriced',
  password: dbPassword,
  port: parseInt(process.env.DB_PORT || '5432'),
  max: 10,
  idleTimeoutMillis: 30000,
};

console.log(`🔌 Attempting connection with: User=${dbConfig.user}, DB=${dbConfig.database}, Port=${dbConfig.port}`);

const pool = new Pool(dbConfig);

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('❌ Database query error:', error);
    throw error; // Re-throw to fail the test
  }
};

export const getClient = async () => {
  const client = await pool.connect();
  return client;
};
require('dotenv').config();
const { pool } = require('../db');
const fs = require('fs');
const path = require('path');

async function initDb() {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('Schema applied successfully.');
  await pool.end();
}

initDb().catch((err) => {
  console.error('Init DB failed:', err);
  process.exit(1);
});

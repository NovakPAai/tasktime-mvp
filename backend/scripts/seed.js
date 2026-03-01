require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query } = require('../db');

const DEMO_PASSWORD = 'demo123';
const DEMO_USERS = [
  { email: 'alice@demo.com', name: 'Alice Johnson', role: 'admin' },
  { email: 'bob@demo.com', name: 'Bob Smith', role: 'user' },
  { email: 'carol@demo.com', name: 'Carol Williams', role: 'user' },
  { email: 'dave@demo.com', name: 'Dave Brown', role: 'user' },
  { email: 'eve@demo.com', name: 'Eve Davis', role: 'manager' },
  { email: 'frank@demo.com', name: 'Frank Miller', role: 'user' },
  { email: 'grace@demo.com', name: 'Grace Wilson', role: 'user' },
  { email: 'henry@demo.com', name: 'Henry Moore', role: 'user' },
  { email: 'iris@demo.com', name: 'Iris Taylor', role: 'user' },
  { email: 'jack@demo.com', name: 'Jack Anderson', role: 'user' },
];

async function seed() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of DEMO_USERS) {
    await query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, name = $3, role = $4`,
      [u.email, hash, u.name, u.role]
    );
    console.log('Seeded user:', u.email);
  }
  console.log('Done. All demo users have password: ' + DEMO_PASSWORD);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

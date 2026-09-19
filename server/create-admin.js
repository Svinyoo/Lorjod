// Provision explicitly from the host; public registration never grants admin access.
const { openDatabase } = require('./database');
const bcrypt = require('bcryptjs');
(async () => {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) throw Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters)');
  const db = await openDatabase();
  try {
    await db.run("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')",[process.env.ADMIN_NAME || 'ผู้ดูแลระบบ',email,await bcrypt.hash(password,12)]);
    console.log('Admin created:',email);
  } finally { await db.close(); }
})().catch(e => { console.error(e.message); process.exitCode=1; });

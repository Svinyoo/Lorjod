const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const port = process.env.PORT || 3000;
const databaseDirectory = path.join(__dirname, '..', 'data');
fs.mkdirSync(databaseDirectory, { recursive: true });
let db;

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-demo-secret-before-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 86400000 }
}));
app.use(express.static(path.join(__dirname, '..', 'client')));

const currentUser = (request) => request.session.user || null;
const requireLogin = (request, response, next) => currentUser(request)
  ? next() : response.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function newSession(request, user) {
  return new Promise((resolve, reject) => request.session.regenerate((error) => {
    if (error) return reject(error);
    request.session.user = user;
    return request.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
  }));
}

app.get('/api/auth/me', (request, response) => response.json({ user: currentUser(request) }));

app.post('/api/auth/register', async (request, response) => {
  const name = request.body?.name?.trim();
  const email = request.body?.email?.trim().toLowerCase();
  const password = request.body?.password;
  if (!name || !validEmail(email || '') || typeof password !== 'string' || password.length < 8) {
    return response.status(400).json({ message: 'กรอกชื่อ อีเมลที่ถูกต้อง และรหัสผ่านอย่างน้อย 8 ตัวอักษร' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name, email, passwordHash]);
    const user = { id: result.lastID, name, email };
    await newSession(request, user);
    return response.status(201).json({ user });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') return response.status(409).json({ message: 'อีเมลนี้ถูกใช้งานแล้ว' });
    throw error;
  }
});

app.post('/api/auth/login', async (request, response) => {
  const email = request.body?.email?.trim().toLowerCase();
  const password = request.body?.password;
  if (!email || typeof password !== 'string') return response.status(400).json({ message: 'กรอกอีเมลและรหัสผ่าน' });
  const account = await db.get('SELECT id, name, email, password_hash FROM users WHERE email = ?', email);
  if (!account || !(await bcrypt.compare(password, account.password_hash))) {
    return response.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }
  const user = { id: account.id, name: account.name, email: account.email };
  await newSession(request, user);
  return response.json({ user });
});

app.post('/api/auth/logout', (request, response, next) => request.session.destroy((error) => {
  if (error) return next(error);
  response.clearCookie('connect.sid');
  return response.status(204).end();
}));

app.get('/api/tasks', requireLogin, async (request, response) => {
  const tasks = await db.all('SELECT id, title, done FROM tasks WHERE user_id = ? ORDER BY id DESC', currentUser(request).id);
  response.json(tasks.map((task) => ({ ...task, done: Boolean(task.done) })));
});
app.post('/api/tasks', requireLogin, async (request, response) => {
  const title = request.body?.title?.trim();
  if (!title) return response.status(400).json({ message: 'กรุณาระบุชื่องาน' });
  const result = await db.run('INSERT INTO tasks (user_id, title) VALUES (?, ?)', [currentUser(request).id, title]);
  return response.status(201).json({ id: result.lastID, title, done: false });
});
app.patch('/api/tasks/:id', requireLogin, async (request, response) => {
  const id = Number(request.params.id);
  const ownerId = currentUser(request).id;
  const existing = await db.get('SELECT id FROM tasks WHERE id = ? AND user_id = ?', [id, ownerId]);
  if (!existing) return response.status(404).json({ message: 'ไม่พบงานนี้' });
  const title = typeof request.body.title === 'string' ? request.body.title.trim() : null;
  if (typeof request.body.done === 'boolean') await db.run('UPDATE tasks SET done = ? WHERE id = ?', [request.body.done ? 1 : 0, id]);
  if (title) await db.run('UPDATE tasks SET title = ? WHERE id = ?', [title, id]);
  const task = await db.get('SELECT id, title, done FROM tasks WHERE id = ?', id);
  return response.json({ ...task, done: Boolean(task.done) });
});
app.delete('/api/tasks/:id', requireLogin, async (request, response) => {
  const result = await db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [Number(request.params.id), currentUser(request).id]);
  return result.changes ? response.status(204).end() : response.status(404).json({ message: 'ไม่พบงานนี้' });
});

async function start() {
  db = await open({ filename: path.join(databaseDirectory, 'app.db'), driver: sqlite3.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ); CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );`);
  app.listen(port, () => console.log(`Open http://localhost:${port}`));
}
start().catch((error) => { console.error(error); process.exit(1); });

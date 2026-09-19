const { test } = require('node:test');
const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { initializeDatabase } = require('../server/database');

test('database initialization is repeatable without duplicating seed data or losing records', async (t) => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  t.after(() => db.close());
  await initializeDatabase(db);
  await db.run("INSERT INTO users(name,email,password_hash,role) VALUES('Existing','existing@example.com','test-hash','admin')");
  await db.run("INSERT INTO admin_audit(admin_id,entity,record_id,reason,before_json,after_json) VALUES(1,'locations',1,'Existing correction','{}','{}')");
  await db.run("UPDATE parking_locations SET hourly_rate=123 WHERE id=1");
  await initializeDatabase(db);
  assert.equal((await db.get('SELECT count(*) count FROM parking_locations')).count, 3);
  assert.equal((await db.get('SELECT count(*) count FROM parking_spots')).count, 12);
  assert.equal((await db.get('SELECT hourly_rate FROM parking_locations WHERE id=1')).hourly_rate, 123);
  assert.equal((await db.get('SELECT role FROM users WHERE id=1')).role, 'admin');
  assert.equal((await db.get('SELECT count(*) count FROM admin_audit')).count, 1);
});

test('legacy accounts retain their data and gain the renter role during migration', async (t) => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users(name,email,password_hash) VALUES('Legacy renter','legacy@example.com','existing-hash');`);
  await initializeDatabase(db);
  const user = await db.get('SELECT * FROM users WHERE id=1');
  assert.equal(user.name, 'Legacy renter');
  assert.equal(user.email, 'legacy@example.com');
  assert.equal(user.password_hash, 'existing-hash');
  assert.equal(user.role, 'renter');
  const location = await db.get('SELECT * FROM parking_locations WHERE id=1');
  assert.equal(location.owner_id, null);
  assert.equal(location.is_published, 1);
});

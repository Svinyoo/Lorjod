const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const filename = path.join(dataDir, "app.db");

async function openDatabase() {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  return db;
}

async function initializeDatabase(db) {
  await db.exec(
    `
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS parking_locations(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      landmarks TEXT NOT NULL,
      hourly_rate INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS parking_spots(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      spot_label TEXT NOT NULL,
      vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('car','ev','motorcycle')),
      FOREIGN KEY(location_id) REFERENCES parking_locations(id),
      UNIQUE(location_id,spot_label)
    );
    CREATE TABLE IF NOT EXISTS vehicles(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plate_number TEXT NOT NULL,
      vehicle_type TEXT NOT NULL,
      description TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS bookings(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      spot_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      total INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL,
      pass_code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(location_id) REFERENCES parking_locations(id),
      FOREIGN KEY(spot_id) REFERENCES parking_spots(id),
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
    );
    CREATE INDEX IF NOT EXISTS bookings_slot_range ON bookings(spot_id,start_at,end_at);
    CREATE TABLE IF NOT EXISTS notifications(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      booking_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      sent_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(booking_id) REFERENCES bookings(id)
    );`,
  );
  // Additive migrations preserve existing renter accounts and sample locations.
  for (const [table, column, definition] of [
    ["users", "role", "TEXT NOT NULL DEFAULT 'renter'"],
    ["parking_locations", "owner_id", "INTEGER REFERENCES users(id)"],
    ["parking_locations", "is_published", "INTEGER NOT NULL DEFAULT 1"],
  ]) {
    const columns = await db.all(`PRAGMA table_info(${table})`);
    if (!columns.some((c) => c.name === column))
      await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  await db.exec(`
    CREATE TABLE IF NOT EXISTS admin_audit(
      id INTEGER PRIMARY KEY,
      admin_id INTEGER NOT NULL,
      entity TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      before_json TEXT NOT NULL,
      after_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
  const count = await db.get("SELECT count(*) count FROM parking_locations");
  if (!count.count)
    await db.exec(
      `INSERT INTO parking_locations(name,address,latitude,longitude,landmarks,hourly_rate) VALUES('Siam Square Parking','สยามสแควร์ ซอย 7, ปทุมวัน',13.7467,100.5327,'["BTS สยาม","Siam Center"]',30),('อโศก อินเตอร์เชนจ์','อโศกมนตรี, วัฒนา',13.7370,100.5601,'["BTS อโศก","Terminal 21"]',40),('ไอคอนสยาม','เจริญนคร, คลองสาน',13.7261,100.5109,'["ICONSIAM","แม่น้ำเจ้าพระยา"]',35);
      INSERT INTO parking_spots(location_id,spot_label,vehicle_type) VALUES(1,'A01','car'),(1,'A02','car'),(1,'EV01','ev'),(1,'M01','motorcycle'),(2,'B12','car'),(2,'B13','car'),(2,'EV03','ev'),(2,'M03','motorcycle'),(3,'C21','car'),(3,'C22','car'),(3,'EV05','ev'),(3,'M07','motorcycle');`,
    );
}

module.exports = { openDatabase, initializeDatabase };

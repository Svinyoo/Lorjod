const express = require("express"),
  session = require("express-session"),
  bcrypt = require("bcryptjs"),
  crypto = require("crypto"),
  path = require("path"),
  fs = require("fs"),
  sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const app = express(),
  port = process.env.PORT || 3000,
  dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });
let db;
app.use(express.json());
app.use(
  session({
    secret:
      process.env.SESSION_SECRET || "change-this-demo-secret-before-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 86400000,
    },
  }),
);
app.use(express.static(path.join(__dirname, "..", "client")));
const user = (r) => r.session.user || null,
  login = (r, s, n) =>
    user(r) ? n() : s.status(401).json({ message: "กรุณาเข้าสู่ระบบก่อน" }),
  email = (x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x),
  labels = { car: "รถยนต์", ev: "EV", motorcycle: "จักรยานยนต์" };
function sessionFor(r, u) {
  return new Promise((ok, bad) =>
    r.session.regenerate((e) => {
      if (e) return bad(e);
      r.session.user = u;
      r.session.save((x) => (x ? bad(x) : ok()));
    }),
  );
}
function range(b) {
  const start = new Date(b.startAt),
    end = new Date(b.endAt);
  if (
    !Number.isFinite(+start) ||
    !Number.isFinite(+end) ||
    end <= start ||
    end - start > 86400000
  )
    throw Error("กรุณาเลือกช่วงเวลาจอดที่ถูกต้อง (ไม่เกิน 24 ชั่วโมง)");
  return { start, end };
}
async function available(locationId, type, start, end) {
  const location = await db.get(
    "SELECT * FROM parking_locations WHERE id=?",
    locationId,
  );
  if (!location) throw Error("ไม่พบลานจอด");
  const total = await db.get(
    "SELECT count(*) count FROM parking_spots WHERE location_id=? AND vehicle_type=?",
    [locationId, type],
  );
  const used = await db.get(
    `SELECT count(*) count FROM bookings b JOIN parking_spots p ON p.id=b.spot_id WHERE p.location_id=? AND p.vehicle_type=? AND b.status IN ('confirmed','active') AND b.start_at<? AND b.end_at>?`,
    [locationId, type, end.toISOString(), start.toISOString()],
  );
  return { location, spaces: Math.max(0, total.count - used.count) };
}
async function price(b) {
  const { start, end } = range(b);
  if (!labels[b.vehicleType]) throw Error("ประเภทรถไม่ถูกต้อง");
  const a = await available(+b.locationId, b.vehicleType, start, end);
  if (!a.spaces) throw Error("ไม่มีช่องจอดว่างในช่วงเวลานี้");
  const hours = Math.ceil((end - start) / 3600000);
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    durationHours: hours,
    total: hours * a.location.hourly_rate,
    availableSpaces: a.spaces,
    rateDescription: `ชั่วโมงละ ${a.location.hourly_rate} บาท`,
    location: a.location,
  };
}
function view(b) {
  return {
    id: b.id,
    startAt: b.start_at,
    endAt: b.end_at,
    total: b.total,
    status: b.status,
    passCode: b.pass_code,
    spotLabel: b.spot_label,
    location: {
      id: b.location_id,
      name: b.location_name,
      address: b.address,
      latitude: b.latitude,
      longitude: b.longitude,
    },
  };
}
app.get("/api/auth/me", (r, s) => s.json({ user: user(r) }));
app.post("/api/auth/register", async (r, s) => {
  const name = r.body?.name?.trim(),
    e = r.body?.email?.trim().toLowerCase(),
    pass = r.body?.password;
  if (!name || !email(e || "") || typeof pass !== "string" || pass.length < 8)
    return s
      .status(400)
      .json({
        message: "กรอกชื่อ อีเมลที่ถูกต้อง และรหัสผ่านอย่างน้อย 8 ตัวอักษร",
      });
  try {
    const hash = await bcrypt.hash(pass, 12),
      x = await db.run(
        "INSERT INTO users (name,email,password_hash) VALUES (?,?,?)",
        [name, e, hash],
      ),
      u = { id: x.lastID, name, email: e };
    await sessionFor(r, u);
    s.status(201).json({ user: u });
  } catch (x) {
    if (x.code === "SQLITE_CONSTRAINT")
      return s.status(409).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
    throw x;
  }
});
app.post("/api/auth/login", async (r, s) => {
  const e = r.body?.email?.trim().toLowerCase(),
    pass = r.body?.password,
    a = await db.get("SELECT * FROM users WHERE email=?", e);
  if (
    !a ||
    typeof pass !== "string" ||
    !(await bcrypt.compare(pass, a.password_hash))
  )
    return s.status(401).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
  const u = { id: a.id, name: a.name, email: a.email };
  await sessionFor(r, u);
  s.json({ user: u });
});
app.post("/api/auth/logout", (r, s, n) =>
  r.session.destroy((e) =>
    e ? n(e) : (s.clearCookie("connect.sid"), s.status(204).end()),
  ),
);
app.get("/api/parking-locations", login, async (r, s) => {
  const q = (r.query.query || "").trim().replace(/^near:.*/, ""),
    term = `%${q}%`,
    rows = await db.all(
      `SELECT l.*,count(p.id) spots FROM parking_locations l LEFT JOIN parking_spots p ON p.location_id=l.id WHERE l.name LIKE ? OR l.address LIKE ? GROUP BY l.id ORDER BY l.id`,
      [term, term],
    ),
    now = new Date(),
    end = new Date(+now + 7200000);
  s.json(
    await Promise.all(
      rows.map(async (l) => {
        const booked = await db.get(
          `SELECT count(*) count FROM bookings b JOIN parking_spots p ON p.id=b.spot_id WHERE p.location_id=? AND p.vehicle_type='car' AND b.status IN ('confirmed','active') AND b.start_at<? AND b.end_at>?`,
          [l.id, end.toISOString(), now.toISOString()],
        );
        return {
          id: l.id,
          name: l.name,
          address: l.address,
          landmarks: JSON.parse(l.landmarks),
          latitude: l.latitude,
          longitude: l.longitude,
          hourlyRate: l.hourly_rate,
          availableSpaces: Math.max(0, l.spots - booked.count),
        };
      }),
    ),
  );
});
app.get("/api/vehicles", login, async (r, s) => {
  const rows = await db.all(
    "SELECT * FROM vehicles WHERE user_id=? ORDER BY is_favorite DESC,id DESC",
    user(r).id,
  );
  s.json(
    rows.map((v) => ({
      id: v.id,
      plateNumber: v.plate_number,
      type: v.vehicle_type,
      typeLabel: labels[v.vehicle_type],
      description: v.description,
      isFavorite: !!v.is_favorite,
    })),
  );
});
app.post("/api/vehicles", login, async (r, s) => {
  const plate = r.body?.plateNumber?.trim().toUpperCase(),
    type = r.body?.type,
    description = r.body?.description?.trim() || null,
    fav = r.body?.isFavorite ? 1 : 0;
  if (!plate || plate.length > 20 || !labels[type])
    return s
      .status(400)
      .json({ message: "กรุณาระบุทะเบียนรถและประเภทรถให้ถูกต้อง" });
  if (fav)
    await db.run(
      "UPDATE vehicles SET is_favorite=0 WHERE user_id=?",
      user(r).id,
    );
  const x = await db.run(
    "INSERT INTO vehicles (user_id,plate_number,vehicle_type,description,is_favorite) VALUES (?,?,?,?,?)",
    [user(r).id, plate, type, description, fav],
  );
  s.status(201).json({
    id: x.lastID,
    plateNumber: plate,
    type,
    typeLabel: labels[type],
    description,
    isFavorite: !!fav,
  });
});
app.post("/api/quotes", login, async (r, s) => {
  try {
    const q = await price(r.body || {});
    s.json({ ...q, location: undefined });
  } catch (e) {
    s.status(400).json({ message: e.message });
  }
});
app.post("/api/bookings", login, async (r, s) => {
  try {
    const v = await db.get("SELECT * FROM vehicles WHERE id=? AND user_id=?", [
      +r.body?.vehicleId,
      user(r).id,
    ]);
    if (!v) throw Error("ไม่พบรถที่เลือก");
    if (v.vehicle_type !== r.body.vehicleType)
      throw Error("ประเภทรถไม่ตรงกับรถที่เลือก");
    const q = await price(r.body),
      spot = await db.get(
        `SELECT p.id,p.spot_label FROM parking_spots p WHERE p.location_id=? AND p.vehicle_type=? AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.spot_id=p.id AND b.status IN ('confirmed','active') AND b.start_at<? AND b.end_at>?) ORDER BY p.id LIMIT 1`,
        [q.location.id, v.vehicle_type, q.endAt, q.startAt],
      );
    if (!spot) throw Error("ช่องจอดเพิ่งถูกจองไป กรุณาเลือกช่วงเวลาอื่น");
    const code = crypto.randomBytes(4).toString("hex").toUpperCase(),
      x = await db.run(
        `INSERT INTO bookings (user_id,location_id,spot_id,vehicle_id,start_at,end_at,total,payment_method,status,pass_code) VALUES (?,?,?,?,?,?,?,?, 'confirmed',?)`,
        [
          user(r).id,
          q.location.id,
          spot.id,
          v.id,
          q.startAt,
          q.endAt,
          q.total,
          r.body.paymentMethod || "promptpay",
          code,
        ],
      ),
      id = x.lastID;
    await db.run(
      `INSERT INTO notifications (user_id,booking_id,kind,scheduled_at) VALUES (?,?,?,?),(?,?,?,?)`,
      [
        user(r).id,
        id,
        "arrival_reminder",
        new Date(+new Date(q.startAt) - 1800000).toISOString(),
        user(r).id,
        id,
        "expiry_reminder",
        new Date(+new Date(q.endAt) - 900000).toISOString(),
      ],
    );
    const b = await db.get(
      `SELECT b.*,p.spot_label,l.name location_name,l.address,l.latitude,l.longitude FROM bookings b JOIN parking_spots p ON p.id=b.spot_id JOIN parking_locations l ON l.id=b.location_id WHERE b.id=?`,
      id,
    );
    s.status(201).json(view(b));
  } catch (e) {
    s.status(400).json({ message: e.message });
  }
});
app.patch("/api/bookings/:id/extend", login, async (r, s) => {
  try {
    const h = +r.body?.hours;
    if (!Number.isInteger(h) || h < 1 || h > 8)
      throw Error("ระบุจำนวนชั่วโมงที่จะขยายให้ถูกต้อง");
    const b = await db.get(
      `SELECT b.* FROM bookings b WHERE b.id=? AND b.user_id=? AND b.status IN ('confirmed','active')`,
      [+r.params.id, user(r).id],
    );
    if (!b) throw Error("ไม่พบการจองที่ยังใช้งานได้");
    const end = new Date(+new Date(b.end_at) + h * 3600000),
      conflict = await db.get(
        `SELECT id FROM bookings WHERE spot_id=? AND id<>? AND status IN ('confirmed','active') AND start_at<? AND end_at>?`,
        [b.spot_id, b.id, end.toISOString(), b.end_at],
      );
    if (conflict) throw Error("ไม่สามารถขยายเวลาได้ เนื่องจากมีผู้จองต่อ");
    const l = await db.get(
      "SELECT hourly_rate FROM parking_locations WHERE id=?",
      b.location_id,
    );
    await db.run("UPDATE bookings SET end_at=?,total=total+? WHERE id=?", [
      end.toISOString(),
      h * l.hourly_rate,
      b.id,
    ]);
    const updated = await db.get(
      `SELECT b.*,p.spot_label,l.name location_name,l.address,l.latitude,l.longitude FROM bookings b JOIN parking_spots p ON p.id=b.spot_id JOIN parking_locations l ON l.id=b.location_id WHERE b.id=?`,
      b.id,
    );
    s.json(view(updated));
  } catch (e) {
    s.status(400).json({ message: e.message });
  }
});
async function start() {
  db = await open({
    filename: path.join(dataDir, "app.db"),
    driver: sqlite3.Database,
  });
  await db.exec(
    `PRAGMA foreign_keys=ON;CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS parking_locations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,address TEXT NOT NULL,latitude REAL NOT NULL,longitude REAL NOT NULL,landmarks TEXT NOT NULL,hourly_rate INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS parking_spots(id INTEGER PRIMARY KEY AUTOINCREMENT,location_id INTEGER NOT NULL,spot_label TEXT NOT NULL,vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('car','ev','motorcycle')),FOREIGN KEY(location_id) REFERENCES parking_locations(id),UNIQUE(location_id,spot_label));CREATE TABLE IF NOT EXISTS vehicles(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,plate_number TEXT NOT NULL,vehicle_type TEXT NOT NULL,description TEXT,is_favorite INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(user_id) REFERENCES users(id));CREATE TABLE IF NOT EXISTS bookings(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,location_id INTEGER NOT NULL,spot_id INTEGER NOT NULL,vehicle_id INTEGER NOT NULL,start_at TEXT NOT NULL,end_at TEXT NOT NULL,total INTEGER NOT NULL,payment_method TEXT NOT NULL,status TEXT NOT NULL,pass_code TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(location_id) REFERENCES parking_locations(id),FOREIGN KEY(spot_id) REFERENCES parking_spots(id),FOREIGN KEY(vehicle_id) REFERENCES vehicles(id));CREATE INDEX IF NOT EXISTS bookings_slot_range ON bookings(spot_id,start_at,end_at);CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,booking_id INTEGER NOT NULL,kind TEXT NOT NULL,scheduled_at TEXT NOT NULL,sent_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(booking_id) REFERENCES bookings(id));`,
  );
  const count = await db.get("SELECT count(*) count FROM parking_locations");
  if (!count.count)
    await db.exec(
      `INSERT INTO parking_locations(name,address,latitude,longitude,landmarks,hourly_rate) VALUES('Siam Square Parking','สยามสแควร์ ซอย 7, ปทุมวัน',13.7467,100.5327,'["BTS สยาม","Siam Center"]',30),('อโศก อินเตอร์เชนจ์','อโศกมนตรี, วัฒนา',13.7370,100.5601,'["BTS อโศก","Terminal 21"]',40),('ไอคอนสยาม','เจริญนคร, คลองสาน',13.7261,100.5109,'["ICONSIAM","แม่น้ำเจ้าพระยา"]',35);INSERT INTO parking_spots(location_id,spot_label,vehicle_type) VALUES(1,'A01','car'),(1,'A02','car'),(1,'EV01','ev'),(1,'M01','motorcycle'),(2,'B12','car'),(2,'B13','car'),(2,'EV03','ev'),(2,'M03','motorcycle'),(3,'C21','car'),(3,'C22','car'),(3,'EV05','ev'),(3,'M07','motorcycle');`,
    );
  app.listen(port, () => console.log(`Open http://localhost:${port}`));
}
start().catch((e) => {
  console.error(e);
  process.exit(1);
});

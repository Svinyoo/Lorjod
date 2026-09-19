const { Router } = require("express");
const crypto = require("crypto");

module.exports = function renterRoutes(db) {
  const router = Router();
  const user = (r) => r.session.user || null,
    login = (r, s, n) =>
      !user(r) ? s.status(401).json({ message: "กรุณาเข้าสู่ระบบก่อน" }) :
        user(r).role !== "renter" ? s.status(403).json({ message: "ฟังก์ชันนี้สำหรับผู้เช่า" }) : n(),
    labels = { car: "รถยนต์", ev: "EV", motorcycle: "จักรยานยนต์" };
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
    if (!location || !location.is_published) throw Error("ลานจอดนี้ยังไม่เปิดรับจอง");
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
  router.get("/parking-locations", login, async (r, s) => {
    const q = (r.query.query || "").trim().replace(/^near:.*/, ""),
      term = `%${q}%`,
      rows = await db.all(
        `SELECT l.*,count(p.id) spots FROM parking_locations l LEFT JOIN parking_spots p ON p.location_id=l.id WHERE l.is_published=1 AND (l.name LIKE ? OR l.address LIKE ?) GROUP BY l.id ORDER BY l.id`,
        [term, term],
      ),
      now = new Date(),
      end = new Date(+now + 7200000);
    s.json(
      await Promise.all(
        rows.map(async (l) => {
          const booked = await db.get(
            `SELECT count(*) count FROM bookings b JOIN parking_spots p ON p.id=b.spot_id WHERE p.location_id=? AND b.status IN ('confirmed','active') AND b.start_at<? AND b.end_at>?`,
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
  router.get("/vehicles", login, async (r, s) => {
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
  router.post("/vehicles", login, async (r, s) => {
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
  router.post("/quotes", login, async (r, s) => {
    try {
      const q = await price(r.body || {});
      s.json({ ...q, location: undefined });
    } catch (e) {
      s.status(400).json({ message: e.message });
    }
  });
  router.post("/bookings", login, async (r, s) => {
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
  router.get("/bookings/:id", login, async (r, s) => {
    const b = await db.get(`SELECT b.*,p.spot_label,l.name location_name,l.address,l.latitude,l.longitude FROM bookings b JOIN parking_spots p ON p.id=b.spot_id JOIN parking_locations l ON l.id=b.location_id WHERE b.id=? AND b.user_id=?`, [r.params.id, user(r).id]);
    if (!b) return s.status(404).json({ message: "ไม่พบการจองของคุณ" });
    s.json(view(b));
  });
  router.patch("/bookings/:id/extend", login, async (r, s) => {
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
  return router;
};

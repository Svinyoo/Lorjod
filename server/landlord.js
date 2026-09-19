const { Router } = require("express");

// All owner data is scoped on the server; a client-supplied owner ID is never trusted.
module.exports = function landlordRoutes(db) {
  const router = Router();
  const guard = (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ message: "กรุณาเข้าสู่ระบบก่อน" });
    if (req.session.user.role !== "landlord") return res.status(403).json({ message: "สำหรับผู้ให้เช่าเท่านั้น" });
    next();
  };
  router.use(guard);
  const owned = (req, id) => db.get('SELECT * FROM parking_locations WHERE id=? AND owner_id=?', [id, req.session.user.id]);
  const fail = (res, message, status = 400) => res.status(status).json({ message });
  router.get('/locations', async (req, res) => {
    const rows = await db.all('SELECT * FROM parking_locations WHERE owner_id=? ORDER BY id DESC', req.session.user.id);
    for (const row of rows) {
      row.spots = await db.all('SELECT id,spot_label,vehicle_type FROM parking_spots WHERE location_id=? ORDER BY id', row.id);
      row.landmarks = JSON.parse(row.landmarks);
    }
    res.json(rows);
  });
  const save = async (req, res) => {
    const id = req.params.id;
    if (id && !await owned(req, id)) return fail(res, 'ไม่พบลานจอดของคุณ', 404);
    const b = req.body || {};
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const address = typeof b.address === 'string' ? b.address.trim() : '';
    const lat = Number(b.latitude), lng = Number(b.longitude), rate = Number(b.hourlyRate);
    if (!name || name.length > 120 || !address || address.length > 300 ||
        b.latitude === '' || b.longitude === '' || !Number.isFinite(lat) || Math.abs(lat) > 90 ||
        !Number.isFinite(lng) || Math.abs(lng) > 180 || !Number.isInteger(rate) || rate < 1 || rate > 10000 ||
        typeof b.isPublished !== 'boolean' || typeof b.landmarks !== 'string' || b.landmarks.length > 500)
      return fail(res, 'ตรวจสอบชื่อ ที่อยู่ พิกัด และราคา 1–10,000 บาทต่อชั่วโมง');
    if (b.isPublished && (!id || !await db.get('SELECT id FROM parking_spots WHERE location_id=? LIMIT 1', id)))
      return fail(res, 'เพิ่มช่องจอดอย่างน้อย 1 ช่องก่อนเปิดรับจอง');
    const values = [name, address, lat, lng, JSON.stringify(b.landmarks.split(',').map(x => x.trim()).filter(Boolean)), rate, b.isPublished ? 1 : 0];
    if (id) {
      await db.run('UPDATE parking_locations SET name=?,address=?,latitude=?,longitude=?,landmarks=?,hourly_rate=?,is_published=? WHERE id=? AND owner_id=?', [...values, id, req.session.user.id]);
      res.json({ id: Number(id) });
    } else {
      const row = await db.run('INSERT INTO parking_locations(name,address,latitude,longitude,landmarks,hourly_rate,is_published,owner_id) VALUES(?,?,?,?,?,?,?,?)', [...values, req.session.user.id]);
      res.status(201).json({ id: row.lastID });
    }
  };
  router.post('/locations', save);
  router.patch('/locations/:id', save);
  router.post('/locations/:id/spots', async (req, res) => {
    if (!await owned(req, req.params.id)) return fail(res, 'ไม่พบลานจอดของคุณ', 404);
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    const type = req.body?.type;
    if (!label || label.length > 20 || !['car','ev','motorcycle'].includes(type)) return fail(res, 'ระบุชื่อช่องจอดไม่เกิน 20 ตัวอักษรและประเภทรถ');
    try {
      const row = await db.run('INSERT INTO parking_spots(location_id,spot_label,vehicle_type) VALUES(?,?,?)', [req.params.id, label, type]);
      res.status(201).json({ id: row.lastID });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT') return fail(res, 'ชื่อช่องจอดนี้มีอยู่แล้ว', 409);
      throw error;
    }
  });
  router.get('/bookings', async (req, res) => {
    res.json(await db.all(`SELECT b.id,b.start_at,b.end_at,b.total,b.status,b.pass_code,b.payment_method,
      l.name location_name,l.id location_id,p.spot_label,u.name renter_name,v.plate_number,v.vehicle_type
      FROM bookings b JOIN parking_locations l ON l.id=b.location_id JOIN parking_spots p ON p.id=b.spot_id
      JOIN users u ON u.id=b.user_id JOIN vehicles v ON v.id=b.vehicle_id WHERE l.owner_id=? ORDER BY b.start_at DESC,b.id DESC`, req.session.user.id));
  });
  router.patch('/bookings/:id/status', async (req, res) => {
    const b = await db.get(`SELECT b.* FROM bookings b JOIN parking_locations l ON l.id=b.location_id WHERE b.id=? AND l.owner_id=?`, [req.params.id, req.session.user.id]);
    if (!b) return fail(res, 'ไม่พบรายการจองของลานคุณ', 404);
    const status = req.body?.status;
    if (!((b.status === 'confirmed' && status === 'active') || (b.status === 'active' && status === 'completed')))
      return fail(res, 'เปลี่ยนสถานะได้จากยืนยันแล้ว → เข้าจอด → ออกแล้วเท่านั้น');
    if (status === 'active' && (Date.now() < Date.parse(b.start_at) || Date.now() >= Date.parse(b.end_at)))
      return fail(res, 'เช็กอินได้ภายในช่วงเวลาที่จองเท่านั้น');
    const result = await db.run('UPDATE bookings SET status=? WHERE id=? AND status=?', [status, b.id, b.status]);
    if (!result.changes) return fail(res, 'สถานะถูกเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่', 409);
    res.json({ id: b.id, status });
  });
  return router;
};

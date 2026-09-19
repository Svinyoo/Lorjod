const { Router } = require("express");

module.exports = function adminRoutes(db) {
  const router = Router();
  router.use(async (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
    const u = await db.get('SELECT role FROM users WHERE id=?', req.session.user.id);
    if (u?.role !== 'admin') return res.status(403).json({ message: 'สำหรับผู้ดูแลระบบเท่านั้น' });
    next();
  });
  const tables = { users: 'users', locations: 'parking_locations', spots: 'parking_spots', vehicles: 'vehicles', bookings: 'bookings' };
  const clean = row => { if (!row) return row; const { password_hash, ...safe } = row; return safe; };
  router.get('/data', async (req, res) => {
    const result = {};
    for (const [key, table] of Object.entries(tables)) result[key] = (await db.all(`SELECT * FROM ${table} ORDER BY id DESC`)).map(clean);
    result.audit = await db.all('SELECT a.*,u.name admin_name FROM admin_audit a LEFT JOIN users u ON u.id=a.admin_id ORDER BY a.id DESC LIMIT 200');
    res.json(result);
  });
  // Serialize transactions on this connection; other application connections respect SQLite's write lock.
  let queue = Promise.resolve();
  router.patch('/:entity/:id', (req, res, next) => {
    const work = queue.then(async () => {
      const table = tables[req.params.entity], b = req.body || {}, id = Number(req.params.id);
      const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
      if (!table || !Number.isSafeInteger(id) || id < 1) return res.status(404).json({ message: 'ไม่พบข้อมูล' });
      if (typeof b.reason !== 'string' || b.reason.trim().length < 5 || b.reason.length > 1000) return res.status(400).json({ message: 'ระบุเหตุผลการแก้ไข 5–1,000 ตัวอักษร' });
      let transaction = false;
      try {
        await db.exec('BEGIN IMMEDIATE'); transaction = true;
        const before = clean(await db.get(`SELECT * FROM ${table} WHERE id=?`, id));
        if (!before) fail('ไม่พบข้อมูล', 404);
        if (!b.before || JSON.stringify(before) !== JSON.stringify(b.before)) fail('ข้อมูลเปลี่ยนแปลงแล้ว กรุณาอัปเดตและเปิดแก้ไขอีกครั้ง', 409);
        const v = b.values || {}, out = {};
        const str = (key, max = 120) => { if (typeof v[key] !== 'string' || !v[key].trim() || v[key].trim().length > max) fail('ตรวจสอบข้อมูล ' + key); return v[key].trim(); };
        const num = (key, min, max, integer = false) => { const n = v[key]; if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) fail('ตรวจสอบข้อมูล ' + key); return n; };
        const type = () => { if (!['car','ev','motorcycle'].includes(v.vehicle_type)) fail('ประเภทรถไม่ถูกต้อง'); return v.vehicle_type; };
        if (table === 'users') {
          if (before.role === 'admin') fail('หน้านี้แก้ไขได้เฉพาะ Renter และ Landlord');
          out.name = str('name'); out.email = str('email',254).toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) fail('อีเมลไม่ถูกต้อง');
        } else if (table === 'parking_locations') {
          Object.assign(out, { name: str('name'), address: str('address',300), latitude: num('latitude',-90,90), longitude: num('longitude',-180,180), hourly_rate: num('hourly_rate',1,10000,true), owner_id: num('owner_id',1,Number.MAX_SAFE_INTEGER,true), is_published: num('is_published',0,1,true) });
          if (!(await db.get("SELECT id FROM users WHERE id=? AND role='landlord'", out.owner_id))) fail('เจ้าของลานต้องเป็น Landlord');
          if (typeof v.landmarks !== 'string' || v.landmarks.length > 500) fail('จุดสังเกตยาวเกินไป');
          out.landmarks = JSON.stringify(v.landmarks.split(',').map(x => x.trim()).filter(Boolean));
          if (out.is_published && !(await db.get('SELECT id FROM parking_spots WHERE location_id=?',id))) fail('เพิ่มช่องจอดก่อนเปิดรับจอง');
        } else if (table === 'parking_spots' || table === 'vehicles') {
          out.vehicle_type = type();
          if (out.vehicle_type !== before.vehicle_type && await db.get(`SELECT id FROM bookings WHERE ${table === 'vehicles' ? 'vehicle_id' : 'spot_id'}=? AND status IN ('confirmed','active')`,id)) fail('มีการจองที่ยังใช้งานอยู่ ไม่สามารถเปลี่ยนประเภทรถ');
          if (table === 'parking_spots') out.spot_label = str('spot_label',20);
          else { out.plate_number = str('plate_number',20).toUpperCase(); if (typeof v.description !== 'string' || v.description.length > 300) fail('รายละเอียดรถไม่ถูกต้อง'); out.description = v.description; }
        } else {
          if (!['confirmed','active','completed','cancelled'].includes(v.status)) fail('สถานะไม่ถูกต้อง');
          if (typeof v.start_at !== 'string' || typeof v.end_at !== 'string') fail('ระบุเวลาเริ่มและสิ้นสุด');
          const start = new Date(v.start_at), end = new Date(v.end_at);
          if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || end-start > 86400000) fail('ช่วงเวลาจองต้องถูกต้องและไม่เกิน 24 ชั่วโมง');
          Object.assign(out, { status: v.status, start_at: start.toISOString(), end_at: end.toISOString(), total: num('total',0,10000000,true), spot_id: num('spot_id',1,Number.MAX_SAFE_INTEGER,true), vehicle_id: num('vehicle_id',1,Number.MAX_SAFE_INTEGER,true) });
          const spot = await db.get('SELECT * FROM parking_spots WHERE id=?',out.spot_id), vehicle = await db.get('SELECT * FROM vehicles WHERE id=?',out.vehicle_id);
          if (!spot || !vehicle || vehicle.user_id !== before.user_id || spot.vehicle_type !== vehicle.vehicle_type) fail('รถต้องเป็นของผู้เช่าเดิมและตรงกับประเภทช่องจอด');
          out.location_id = spot.location_id;
          if (['confirmed','active'].includes(out.status) && await db.get("SELECT id FROM bookings WHERE id<>? AND spot_id=? AND status IN ('confirmed','active') AND start_at<? AND end_at>?",[id,out.spot_id,out.end_at,out.start_at])) fail('ช่องจอดนี้มีการจองซ้อนในช่วงเวลาที่เลือก',409);
          if (out.status === 'active' && !(+start <= Date.now() && Date.now() < +end)) fail('สถานะเข้าจอดต้องอยู่ในช่วงเวลาจอง');
        }
        await db.run(`UPDATE ${table} SET ${Object.keys(out).map(k => k+'=?').join(',')} WHERE id=?`,[...Object.values(out),id]);
        if (table === 'bookings') {
          await db.run('DELETE FROM notifications WHERE booking_id=? AND sent_at IS NULL',id);
          if (['confirmed','active'].includes(out.status)) for (const [kind,when] of [['arrival_reminder',Date.parse(out.start_at)-1800000],['expiry_reminder',Date.parse(out.end_at)-900000]]) await db.run('INSERT INTO notifications(user_id,booking_id,kind,scheduled_at) VALUES(?,?,?,?)',[before.user_id,id,kind,new Date(when).toISOString()]);
        }
        const after = clean(await db.get(`SELECT * FROM ${table} WHERE id=?`,id));
        await db.run('INSERT INTO admin_audit(admin_id,entity,record_id,reason,before_json,after_json) VALUES(?,?,?,?,?,?)',[req.session.user.id,req.params.entity,id,b.reason.trim(),JSON.stringify(before),JSON.stringify(after)]);
        await db.exec('COMMIT'); transaction = false;
        res.json(after);
      } catch (e) {
        if (transaction) await db.exec('ROLLBACK');
        if (e.status || e.code === 'SQLITE_CONSTRAINT') return res.status(e.status || 409).json({ message: e.status ? e.message : 'ข้อมูลซ้ำหรืออ้างอิงไม่ถูกต้อง' });
        throw e;
      }
    });
    queue = work.catch(() => {}); work.catch(next);
  });
  return router;
};

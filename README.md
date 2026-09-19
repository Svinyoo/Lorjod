# Parkly — ระบบจองที่จอดรถ

เว็บแอปสำหรับผู้จองที่ล็อกอินแล้ว: ค้นหาลานจอด, เลือกเวลา/รถ, เห็นราคาและช่องว่างแบบเรียลไทม์, ยืนยันการจอง และรับ Digital Pass พร้อม QR-style code

## เริ่มต้น

ต้องมี Node.js 18 ขึ้นไป

```bash
npm install
npm start
```

เปิด `http://localhost:3000/register.html` เพื่อสมัครสมาชิก แล้วเข้าสู่ flow การจองทันที ข้อมูลลานจอดตัวอย่างจะถูก seed ลง SQLite ครั้งแรกที่เปิดระบบ

## UI flow

1. **Search & Select** — ค้นหาชื่อ/ที่อยู่, กด “ใกล้ฉัน”, เห็นจุดสังเกต อัตรา และจำนวนช่องว่าง
2. **Time & Vehicle** — ระบุวัน Check-in / Check-out หรือจำนวนชั่วโมง แล้วเลือกรถคันโปรดหรือเพิ่มทะเบียนใหม่
3. **Review & Pay** — ดูสรุปสถานที่ เวลา รถ และยอดรวมก่อนเลือกช่องทางชำระเงินและยืนยัน
4. **Active Ticket** — ได้ passcode/QR-style pass, ปุ่มนำทาง, ตัวนับเวลาคงเหลือ และปุ่มขยายเวลาจอด

เมื่อสร้างการจอง จะสร้าง notification record สำหรับเตือนก่อนถึงเวลา 30 นาทีและก่อนหมดเวลา 15 นาที ระบบส่ง push จริงควรมี worker ที่อ่าน `notifications` ที่ `scheduled_at <= now` แล้วเรียกผู้ให้บริการ push เช่น FCM/APNs

## API data structure

ทุก endpoint ด้านล่างต้องมี session จากการล็อกอิน ยกเว้น auth endpoints

| Method     | Path                                                        | Request / Response หลัก                                                                                                          |
| ---------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GET        | `/api/parking-locations?query=`                             | `[{ id, name, address, landmarks[], latitude, longitude, hourlyRate, availableSpaces }]`                                         |
| GET / POST | `/api/vehicles`                                             | POST: `{ plateNumber, type: "car"\|"ev"\|"motorcycle", description, isFavorite }`                                                |
| POST       | `/api/quotes`                                               | Request: `{ locationId, vehicleType, startAt, endAt }`; response: `{ durationHours, total, availableSpaces, rateDescription }`   |
| POST       | `/api/bookings`                                             | Request: quote fields + `{ vehicleId, paymentMethod }`; response: `{ id, startAt, endAt, total, passCode, spotLabel, location }` |
| PATCH      | `/api/bookings/:id/extend`                                  | `{ hours }` — ยืนยันว่า slot ยังไม่มีผู้จองซ้อนก่อนขยาย                                                                          |
| GET        | `/api/auth/me`                                              | `{ user }`                                                                                                                       |
| POST       | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Session authentication                                                                                                           |

เวลาใช้ ISO 8601 จาก client ไป API และเก็บเป็น UTC string ใน SQLite; API ปัดระยะเวลาขึ้นเป็นจำนวนเต็มชั่วโมงก่อนคิดราคา ระบบเช็ก overlapping interval ด้วยเงื่อนไข `existing.start_at < requested.end_at AND existing.end_at > requested.start_at`

## Database schema (เบื้องต้น)

| Table               | Purpose / fields สำคัญ                                                  |
| ------------------- | ----------------------------------------------------------------------- |
| `users`             | ผู้ใช้และ `password_hash`                                               |
| `parking_locations` | ชื่อลาน, ที่อยู่, พิกัด, landmarks JSON, `hourly_rate`                  |
| `parking_spots`     | ช่องจริงในลาน, `spot_label`, ประเภทรถ (`car`, `ev`, `motorcycle`)       |
| `vehicles`          | รถของผู้ใช้: ทะเบียน, ประเภทรถ, รายละเอียด, `is_favorite`               |
| `bookings`          | ผู้จอง, ลาน, ช่อง, รถ, เวลาเริ่ม/จบ, ยอดเงิน, สถานะ, payment, pass code |
| `notifications`     | งานแจ้งเตือนที่ schedule ได้ต่อการจอง และเวลาที่ส่งแล้ว                 |

มี index `bookings_slot_range (spot_id, start_at, end_at)` เพื่อรองรับการตรวจช่วงเวลาจองซ้อนในระดับต้นแบบ

## ข้อควรต่อยอดก่อน production

- ใช้ transaction/unique lock ในระดับฐานข้อมูลที่รองรับ concurrent booking (เช่น PostgreSQL exclusion constraint) เพื่อกันการจอง slot เดียวกันพร้อมกัน
- เปลี่ยน QR-style visual ในเดโมเป็น QR ที่มี signed, short-lived token และให้ประตูตรวจสอบกับ API
- ต่อ payment gateway และเปลี่ยนสถานะ booking เป็น `confirmed` หลัง webhook ที่ตรวจสอบลายเซ็นแล้ว
- ทำ background worker สำหรับ push notifications และบันทึก delivery status/retry

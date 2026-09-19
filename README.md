# Parkly — ระบบจองที่จอดรถ

เว็บแอปสำหรับผู้จองที่ล็อกอินแล้ว: ค้นหาลานจอด, เลือกเวลา/รถ, เห็นราคาและช่องว่างแบบเรียลไทม์, ยืนยันการจอง และรับ Digital Pass พร้อม QR-style code

## เริ่มต้น

ต้องมี Node.js 18 ขึ้นไป

```bash
npm install
npm start
```

เปิด `http://localhost:3000/register.html` เพื่อสมัครสมาชิก แล้วเข้าสู่ flow การจองทันที ข้อมูลลานจอดตัวอย่างจะถูก seed ลง SQLite ครั้งแรกที่เปิดระบบ

## โครงสร้างสำหรับพัฒนา

```text
server/
  index.js         เริ่มเซิร์ฟเวอร์ ตั้งค่า session และเชื่อมหน้าเว็บ/API
  auth.js          สมัครสมาชิก เข้าสู่ระบบ ออกจากระบบ ทุกบทบาท
  renter.js        API ผู้เช่า: ค้นหาลาน รถ ราคา จอง และขยายเวลา
  landlord.js      API ผู้ให้เช่า: ลาน ช่องจอด และบันทึกเข้า–ออก
  admin.js         API ผู้ดูแล: แก้ไขข้อมูลและบันทึกประวัติ
  database.js      เปิดฐานข้อมูล สร้างตาราง migration และข้อมูลตัวอย่าง
  create-admin.js  คำสั่งสร้างบัญชี Admin บนเซิร์ฟเวอร์
Client_Renter/     หน้าเว็บผู้เช่า
Client_Landlord/   หน้าเว็บผู้ให้เช่า
Client_Admin/
  public/          หน้าเว็บผู้ดูแล
  README.md        คู่มือผู้ดูแล
tests/           ชุดทดสอบ API และฐานข้อมูล
```

ไฟล์ `auth.js`, `renter.js`, `landlord.js` และ `admin.js` รับ `db` แล้วคืน Express Router ในรูปแบบเดียวกัน โดย `index.js` กำหนด URL หลักเป็น `/api/auth`, `/api`, `/api/landlord` และ `/api/admin` ตามลำดับ หากเพิ่ม endpoint ให้แก้ไฟล์ตามบทบาทและเพิ่มกรณีทดสอบใน `tests/` ส่วนการเปลี่ยนตารางให้เพิ่ม migration ใน `database.js` เพื่อรักษาข้อมูลเดิม

Admin ใช้ connection แยกไปยังฐานข้อมูลไฟล์เดียวกัน เพื่อไม่ให้คำขอของบทบาทอื่นแทรกเข้า transaction การแก้ไขข้อมูล ยังคงใช้ URL หน้าเว็บ `/`, `/landlord/`, `/admin/` และคำสั่ง `npm start` ตามเดิม

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


## ฝั่งผู้ให้เช่า (Client_Landlord)

เปิด `http://localhost:3000/landlord/register.html` เพื่อสมัครบัญชีผู้ให้เช่า หรือ `/landlord/login.html` เพื่อเข้าสู่ระบบ ส่วนผู้เช่าใช้ `/` และ `/login.html` ตามเดิม

โครงสร้างไฟล์ขนานกับ `Client_Renter`: `index.html`, `app.js`, `styles.css`, `login.html`, `register.html`, `auth.js` ฝั่งผู้ให้เช่าใช้ sidebar สีเขียวเข้มและสีทอง พร้อมป้ายบทบาท แทนขั้นตอนการจองของผู้เช่า

1. **ลานและช่องจอด** — เพิ่มลานเป็นฉบับร่าง ระบุที่อยู่ พิกัด ราคา และจุดสังเกต เพิ่มช่องจอดพร้อมประเภทรถ แล้วกดแก้ไขลานเพื่อเปิดรับจอง
2. **เชื่อมกับผู้เช่า** — ลานที่เปิดรับจองแสดงในหน้าค้นหาของผู้เช่าทันที ใช้ราคา ช่องจอด และการจองจากฐานข้อมูลเดียวกัน กดอัปเดตข้อมูลเพื่อโหลดรายการใหม่
3. **รายการจอง** — ค้นหาผู้เช่า ทะเบียน หรือ Pass และกรองสถานะ ตรวจ Pass แล้วบันทึกเข้าในช่วงเวลาจอง (`confirmed → active`) และออกจากลาน (`active → completed`)
4. **ยอดการจอง** — แสดงมูลค่าการจองสะสมแยกตามลาน รวมสถานะยืนยันแล้ว เข้าจอด และออกแล้ว เป็นมูลค่าการจอง ไม่ใช่ยอดรับเงินจริง

แก้ไขราคามีผลกับการจองใหม่ ส่วนการต่อเวลาคิดตามราคาปัจจุบันตามพฤติกรรมเดิม การปิดรับจองจะซ่อนลานและป้องกันการจองใหม่ แต่เก็บรายการจองเดิมไว้ให้จัดการเข้า–ออกได้ ไม่มีการลบประวัติหรือโอนลานตัวอย่างให้บัญชีที่สมัครใหม่

### สิทธิ์และฐานข้อมูล

- เพิ่ม `users.role` (`renter` / `landlord`), `parking_locations.owner_id` และ `is_published` ด้วย migration แบบเพิ่มคอลัมน์ ไม่ลบข้อมูลเดิม
- บัญชีเดิมเป็นผู้เช่า ลานตัวอย่างเดิมยังเปิดรับจอง แต่ไม่มีเจ้าของ ผู้ให้เช่าใหม่ต้องสร้างลานของตนเอง
- API ผู้ให้เช่าตรวจบทบาทและเจ้าของจาก session ทุกครั้ง ดูหรือแก้ไขลานและการจองของผู้อื่นไม่ได้ API สำหรับการจองและรถจำกัดให้ผู้เช่า
- ทั้งสองฝั่งใช้ session เดียวกันในเบราว์เซอร์ หากทดสอบสองบทบาทพร้อมกันให้ใช้คนละ browser profile หรือหน้าต่างส่วนตัว

| Method | Path | หน้าที่ |
| --- | --- | --- |
| GET / POST | `/api/landlord/locations` | ดูลานของตนเอง / สร้างลานฉบับร่าง |
| PATCH | `/api/landlord/locations/:id` | แก้ไขข้อมูล ราคา และสถานะเปิดรับจอง |
| POST | `/api/landlord/locations/:id/spots` | เพิ่มช่องจอด `{ label, type }` |
| GET | `/api/landlord/bookings` | ดูรายการจองของลานที่เป็นเจ้าของ |
| PATCH | `/api/landlord/bookings/:id/status` | บันทึกเข้า–ออก `{ status: "active" หรือ "completed" }` |

### ทดสอบ

รัน `npm test` เพื่อตรวจการสมัครและเข้าสู่ระบบตามบทบาท การป้องกันสิทธิ์ข้ามเจ้าของ การเปิดลาน การจองและต่อเวลาจากผู้เช่า และสถานะเข้า–ออก ใช้ฐานข้อมูลในโฟลเดอร์ชั่วคราวและไม่แตะข้อมูลใช้งานจริง กำหนด `DATA_DIR` เพื่อใช้ฐานข้อมูลแยกสำหรับการพัฒนาหรือทดสอบได้

## Client_Admin — ผู้ดูแลระบบ

เพิ่มฝั่ง Admin แยกใน `Client_Admin/` เปิดที่ `/admin/` สำหรับแก้ไขข้อมูลผู้ใช้ ลาน ช่องจอด รถ และการจอง พร้อมเหตุผลและประวัติการเปลี่ยนแปลง ดูการสร้างบัญชีและขอบเขตที่ [Client_Admin/README.md](Client_Admin/README.md)

### ทดสอบฝั่ง Renter

รันเฉพาะ Renter ด้วย `node --test tests/renter.test.js` หรือรันทุกฝั่งด้วย `npm test`

`tests/renter.test.js` ทดสอบ API ผ่าน HTTP และ session จริง 7 กลุ่ม: หน้าเว็บและสิทธิ์เข้าถึง, สมัคร/เข้าสู่ระบบ/ออกจากระบบ, รถและรถคันโปรด, ค้นหาลาน, คำนวณราคาและตรวจช่วงเวลา, จองและป้องกันเข้าถึงข้อมูลผู้อื่น/จองซ้อน, ขยายเวลาและตรวจยอดเงิน ใช้ฐานข้อมูลชั่วคราวซึ่งลบหลังทดสอบ ไม่แตะ `data/app.db` การทดสอบนี้ยังไม่ใช่การทดสอบคลิกใช้งานผ่านเบราว์เซอร์

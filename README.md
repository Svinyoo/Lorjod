# Full-stack Task Board

เดโมแอปรายการงานขนาดเล็ก พร้อมหน้า Register/Login โดยมี frontend แบบ HTML/CSS/JavaScript และ backend แบบ Node.js + Express อยู่ในโปรเจกต์เดียวกัน

## เริ่มใช้งาน

ต้องมี Node.js 18 ขึ้นไป

```bash
npm install
npm start
```

จากนั้นเปิด [http://localhost:3000](http://localhost:3000)

เริ่มต้นใช้งานด้วยการเปิด `http://localhost:3000/register.html` เพื่อสมัครสมาชิก หรือ `http://localhost:3000/login.html` เพื่อเข้าสู่ระบบ

## โครงสร้าง

- `client/` — หน้าเว็บและโค้ดเรียก API
- `server/index.js` — Express API และการเสิร์ฟหน้าเว็บ
- `data/app.db` — SQLite database ที่ระบบจะสร้างอัตโนมัติเมื่อเริ่ม server

ระบบไม่เก็บรหัสผ่านเป็นข้อความธรรมดา แต่เก็บ bcrypt hash ในตาราง `users` และใช้ HTTP-only session cookie เพื่อระบุผู้ใช้ที่ล็อกอินแล้ว

## API

| Method | Path | หน้าที่ |
| --- | --- | --- |
| GET | `/api/tasks` | อ่านรายการงาน |
| POST | `/api/tasks` | สร้างงาน (`{ "title": "..." }`) |
| PATCH | `/api/tasks/:id` | แก้ `title` หรือ `done` |
| DELETE | `/api/tasks/:id` | ลบงาน |
| POST | `/api/auth/register` | สมัครสมาชิก |
| POST | `/api/auth/login` | เข้าสู่ระบบ |
| POST | `/api/auth/logout` | ออกจากระบบ |
| GET | `/api/auth/me` | ดูข้อมูลผู้ใช้ที่กำลังเข้าสู่ระบบ |

ข้อมูลผู้ใช้และงานถูกเก็บอย่างถาวรใน SQLite และ API ของงานตรวจสอบเจ้าของบัญชีก่อนอ่านหรือแก้ไขข้อมูลทุกครั้ง

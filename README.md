# Full-stack Task Board

เดโมแอปรายการงานขนาดเล็ก โดยมี frontend แบบ HTML/CSS/JavaScript และ backend แบบ Node.js + Express อยู่ในโปรเจกต์เดียวกัน

## เริ่มใช้งาน

ต้องมี Node.js 18 ขึ้นไป

```bash
npm install
npm start
```

จากนั้นเปิด [http://localhost:3000](http://localhost:3000)

## โครงสร้าง

- `client/` — หน้าเว็บและโค้ดเรียก API
- `server/index.js` — Express API และการเสิร์ฟหน้าเว็บ

## API

| Method | Path | หน้าที่ |
| --- | --- | --- |
| GET | `/api/tasks` | อ่านรายการงาน |
| POST | `/api/tasks` | สร้างงาน (`{ "title": "..." }`) |
| PATCH | `/api/tasks/:id` | แก้ `title` หรือ `done` |
| DELETE | `/api/tasks/:id` | ลบงาน |

ข้อมูลถูกเก็บในหน่วยความจำ จึงจะกลับเป็นค่าเริ่มต้นเมื่อรีสตาร์ตเซิร์ฟเวอร์

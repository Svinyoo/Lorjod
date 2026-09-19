const { Router } = require("express");
const bcrypt = require("bcryptjs");

module.exports = function authRoutes(db) {
  const router = Router();
  const user = (req) => req.session.user || null;
  const email = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  function sessionFor(r, u) {
    return new Promise((ok, bad) =>
      r.session.regenerate((e) => {
        if (e) return bad(e);
        r.session.user = u;
        r.session.save((x) => (x ? bad(x) : ok()));
      }),
    );
  }
  router.get("/me", (r, s) => s.json({ user: user(r) }));
  router.post("/register", async (r, s) => {
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
          "INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)",
          [name, e, hash, r.body.role === "landlord" ? "landlord" : "renter"],
        ),
        u = { id: x.lastID, name, email: e, role: r.body.role === "landlord" ? "landlord" : "renter" };
      await sessionFor(r, u);
      s.status(201).json({ user: u });
    } catch (x) {
      if (x.code === "SQLITE_CONSTRAINT")
        return s.status(409).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
      throw x;
    }
  });
  router.post("/login", async (r, s) => {
    const e = r.body?.email?.trim().toLowerCase(),
      pass = r.body?.password,
      a = await db.get("SELECT * FROM users WHERE email=?", e);
    if (
      !a ||
      typeof pass !== "string" ||
      !(await bcrypt.compare(pass, a.password_hash))
    )
      return s.status(401).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
    if (r.body.role && r.body.role !== a.role)
      return s.status(403).json({ message: "บัญชีนี้เป็นคนละบทบาท กรุณาเข้าสู่ระบบที่หน้าบทบาทของคุณ" });
    const u = { id: a.id, name: a.name, email: a.email, role: a.role };
    await sessionFor(r, u);
    s.json({ user: u });
  });
  router.post("/logout", (r, s, n) =>
    r.session.destroy((e) =>
      e ? n(e) : (s.clearCookie("connect.sid"), s.status(204).end()),
    ),
  );
  return router;
};

const express = require("express");
const session = require("express-session");
const path = require("path");
const { openDatabase, initializeDatabase } = require("./database");
const authRoutes = require("./auth");
const renterRoutes = require("./renter");
const landlordRoutes = require("./landlord");
const adminRoutes = require("./admin");

async function start() {
  const db = await openDatabase();
  await initializeDatabase(db);
  // A separate connection keeps Admin transactions isolated from other requests.
  const adminDb = await openDatabase();
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || "change-this-demo-secret-before-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 86400000,
    },
  }));

  app.use("/admin", express.static(path.join(__dirname, "..", "Client_Admin", "public")));
  app.use("/landlord", express.static(path.join(__dirname, "..", "Client_Landlord")));
  app.use(express.static(path.join(__dirname, "..", "client_Renter")));

  app.use("/api/auth", authRoutes(db));
  app.use("/api/landlord", landlordRoutes(db));
  app.use("/api/admin", adminRoutes(adminDb));
  app.use("/api", renterRoutes(db));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่" });
  });
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Open http://localhost:${port}`));
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

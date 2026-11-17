require("dotenv").config();
const m = require("mongoose"), b = require("bcryptjs"), { Student } = require("./models");
(async () => {
  if (!process.env.ADMIN_PASSWORD) { console.error("Set ADMIN_PASSWORD in .env first"); process.exit(1); }
  await m.connect(process.env.MONGODB_URI);
  const regNo = process.env.ADMIN_REGNO || "ADM-01";
  if (await Student.findOne({ regNo })) console.log("Admin already exists:", regNo);
  else {
    await Student.create({ name: "Administrator", regNo, email: process.env.ADMIN_EMAIL || "admin@bugema.example",
      password: await b.hash(process.env.ADMIN_PASSWORD, 10), role: "admin" });
    console.log("Admin created:", regNo);
  }
  process.exit(0);
})();

require("dotenv").config();
const express = require("express"), mongoose = require("mongoose"), cors = require("cors"), path = require("path");
for (const k of ["MONGODB_URI", "JWT_SECRET"]) if (!process.env[k]) { console.error(`Missing ${k} in .env`); process.exit(1); }

const app = express();
app.use(cors(), express.json({ limit: "1mb" }));
app.use("/api", require("./routes"));
app.use(express.static(path.join(__dirname, "public")));   // the front end

app.use((e, q, s, n) => {
  console.error(e);
  if (e.name === "ValidationError" || e.name === "CastError") return s.status(400).json({ error: "Some fields are missing or invalid." });
  if (e.code === 11000) return s.status(409).json({ error: "That registration number or email is already registered." });
  s.status(500).json({ error: "Something went wrong." });
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(process.env.PORT || 3000, () => console.log("Bugema Lost & Found running on port " + (process.env.PORT || 3000))))
  .catch(e => { console.error("MongoDB connection failed:", e.message); process.exit(1); });

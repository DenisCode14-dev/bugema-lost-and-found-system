const r = require("express").Router(), bcrypt = require("bcryptjs"), jwt = require("jsonwebtoken"), M = require("./models");
const wrap = f => (q, s, n) => f(q, s, n).catch(n);
const bad = (s, c, e) => s.status(c).json({ error: e });
const esc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sign = u => jwt.sign({ id: u._id, role: u.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
const pub = u => ({ id: u._id, name: u.name, regNo: u.regNo, email: u.email, role: u.role });
const auth = (q, s, n) => {
  try { q.user = jwt.verify((q.headers.authorization || "").replace("Bearer ", ""), process.env.JWT_SECRET); n(); }
  catch { bad(s, 401, "Please log in."); }
};
const admin = (q, s, n) => q.user.role === "admin" ? n() : bad(s, 403, "Administrators only.");
const kinds = { lost: M.LostItem, found: M.FoundItem }, pre = { lost: "LST-", found: "FND-" };
const kind = (q, s, n) => { q.I = kinds[q.params.kind]; q.I ? n() : bad(s, 404, "Unknown item type."); };
const notify = (user, text, forRole) => M.Notification.create({ user, forRole, text });
const hide = q => q.user.role === "admin" ? "" : "-reportedBy";   // finder details never shown to students

/* ---------- accounts ---------- */
r.post("/auth/register", wrap(async (q, s) => {
  const { name, regNo, email, phone, password } = q.body;
  if (!name || !regNo || !email || !password || password.length < 6)
    return bad(s, 400, "Name, registration number, email and a password of 6+ characters are required.");
  const u = await M.Student.create({ name, regNo, email, phone, password: await bcrypt.hash(password, 10) });
  s.status(201).json({ token: sign(u), user: pub(u) });
}));
r.post("/auth/login", wrap(async (q, s) => {
  const u = await M.Student.findOne({ regNo: String(q.body.regNo || "").trim() });
  if (!u || !(await bcrypt.compare(q.body.password || "", u.password))) return bad(s, 401, "Wrong registration number or password.");
  if (!u.active) return bad(s, 403, "This account is suspended.");
  s.json({ token: sign(u), user: pub(u) });
}));
r.get("/auth/me", auth, wrap(async (q, s) => s.json(pub(await M.Student.findById(q.user.id)))));

/* ---------- lost & found items ---------- */
r.get("/items/:kind", auth, kind, wrap(async (q, s) => {
  const { search, category, status } = q.query, f = {};
  if (search) f.name = { $regex: esc(search), $options: "i" };
  if (category) f.category = category;
  if (status) f.status = status;
  s.json(await q.I.find(f).sort("-createdAt").select(hide(q)).lean());
}));
r.post("/items/:kind", auth, kind, wrap(async (q, s) => {
  const { name, category, description, location, date } = q.body, k = q.params.kind;
  const ref = await M.nextRef(k, pre[k]);
  const it = await q.I.create({ ref, name, category, description, location, date, reportedBy: q.user.id });
  await notify(q.user.id, `Your ${k} report ${ref} was submitted.`);
  await notify(null, `New ${k} report ${ref} was submitted.`, "admin");
  s.status(201).json(it);
}));
r.get("/items/:kind/:id", auth, kind, wrap(async (q, s) => {
  const it = await q.I.findById(q.params.id).select(hide(q)).lean();
  it ? s.json(it) : bad(s, 404, "Item not found.");
}));
r.put("/items/:kind/:id", auth, admin, kind, wrap(async (q, s) => {
  const { name, category, description, location, status } = q.body;
  const it = await q.I.findByIdAndUpdate(q.params.id, { name, category, description, location, status }, { new: true, runValidators: true });
  it ? s.json(it) : bad(s, 404, "Item not found.");
}));
r.delete("/items/:kind/:id", auth, admin, kind, wrap(async (q, s) => {
  const it = await q.I.findByIdAndDelete(q.params.id);
  it ? s.json({ deleted: it.ref }) : bad(s, 404, "Item not found.");
}));
r.patch("/items/found/:id/return", auth, admin, wrap(async (q, s) => {
  const it = await M.FoundItem.findById(q.params.id);
  if (!it) return bad(s, 404, "Item not found.");
  const c = await M.Claim.findOne({ foundItem: it._id, status: "Approved" });
  if (!c) return bad(s, 409, "Approve a claim before marking the item as returned.");
  it.status = "Returned"; await it.save();
  await notify(c.claimant, "Your item has been marked as returned.");
  s.json(it);
}));

/* ---------- my pages ---------- */
r.get("/my/reports", auth, wrap(async (q, s) => {
  const f = { reportedBy: q.user.id };
  s.json({ lost: await M.LostItem.find(f).sort("-createdAt").lean(), found: await M.FoundItem.find(f).sort("-createdAt").lean() });
}));
r.get("/my/summary", auth, wrap(async (q, s) => {
  const u = q.user.id, f = { reportedBy: u }, c = { claimant: u };
  const [lost, found, pending, decided] = await Promise.all([
    M.LostItem.countDocuments(f), M.FoundItem.countDocuments(f),
    M.Claim.countDocuments({ ...c, status: "Pending" }), M.Claim.countDocuments({ ...c, status: { $ne: "Pending" } })]);
  s.json({ lost, found, pendingClaims: pending, resolvedCases: decided });
}));

/* ---------- claims ---------- */
r.post("/claims", auth, wrap(async (q, s) => {
  const { foundItem, reason, identifyingMarks, proofType, evidence } = q.body;
  const it = await M.FoundItem.findById(foundItem);
  if (!it) return bad(s, 404, "Item not found.");
  if (it.status !== "Found") return bad(s, 409, "This item is no longer open for claims.");
  if (String(it.reportedBy) === q.user.id) return bad(s, 400, "You can’t claim an item you reported as found.");
  if (await M.Claim.findOne({ foundItem, claimant: q.user.id, status: "Pending" })) return bad(s, 409, "You already have a pending claim on this item.");
  const c = await M.Claim.create({ ref: await M.nextRef("claim", "CLM-"), foundItem, claimant: q.user.id, reason, identifyingMarks, proofType, evidence });
  await notify(q.user.id, `Your claim ${c.ref} was submitted.`);
  await notify(null, `A claim ${c.ref} was submitted for ${it.ref}.`, "admin");
  s.status(201).json(c);
}));
r.get("/claims/mine", auth, wrap(async (q, s) =>
  s.json(await M.Claim.find({ claimant: q.user.id }).sort("-createdAt").populate("foundItem", "ref name status").lean())));
r.get("/claims", auth, admin, wrap(async (q, s) =>
  s.json(await M.Claim.find(q.query.status ? { status: q.query.status } : {}).sort("-createdAt")
    .populate("foundItem").populate("claimant", "name regNo email phone").lean())));
r.patch("/claims/:id/review", auth, admin, wrap(async (q, s) => {
  const { decision, reason } = q.body;
  if (!["Approved", "Rejected", "Info"].includes(decision)) return bad(s, 400, "Decision must be Approved, Rejected or Info.");
  if (decision !== "Info" && !(reason || "").trim()) return bad(s, 400, "A reason is required to approve or reject.");
  const c = await M.Claim.findById(q.params.id).populate("foundItem");
  if (!c) return bad(s, 404, "Claim not found.");
  if (c.status !== "Pending") return bad(s, 409, "This claim was already decided.");
  c.reviewedBy = q.user.id;
  if (decision === "Info") c.adminNote = "More information requested" + (reason ? ": " + reason : "");
  else {
    c.status = decision; c.adminNote = reason;
    if (decision === "Approved") { c.foundItem.status = "Reserved"; await c.foundItem.save(); }  // approved ≠ returned
  }
  await c.save();
  await notify(c.claimant, `Your claim ${c.ref}: ${decision === "Info" ? "more information requested" : decision.toLowerCase()}.`);
  s.json(c);
}));

/* ---------- admin ---------- */
r.get("/stats", auth, admin, wrap(async (q, s) => {
  const [lost, found, pending, approved, resolved] = await Promise.all([
    M.LostItem.countDocuments(), M.FoundItem.countDocuments(),
    M.Claim.countDocuments({ status: "Pending" }), M.Claim.countDocuments({ status: "Approved" }),
    M.FoundItem.countDocuments({ status: { $in: ["Reserved", "Returned"] } })]);
  s.json({ lost, found, totalReports: lost + found, pendingClaims: pending, approvedClaims: approved, resolvedItems: resolved });
}));
r.get("/users", auth, admin, wrap(async (q, s) => s.json(await M.Student.find().select("-password").sort("-createdAt").lean())));
r.patch("/users/:id/active", auth, admin, wrap(async (q, s) => {
  if (q.params.id === q.user.id) return bad(s, 400, "You can’t suspend your own account.");
  const u = await M.Student.findByIdAndUpdate(q.params.id, { active: !!q.body.active }, { new: true }).select("-password");
  u ? s.json(u) : bad(s, 404, "User not found.");
}));

/* ---------- notifications ---------- */
r.get("/notifications", auth, wrap(async (q, s) =>
  s.json(await M.Notification.find({ $or: [{ user: q.user.id }, { forRole: q.user.role }] }).sort("-createdAt").limit(50).lean())));

module.exports = r;

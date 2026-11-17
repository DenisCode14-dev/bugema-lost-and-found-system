const m = require("mongoose"), S = m.Schema, ID = S.Types.ObjectId;

const Student = m.model("Student", new S({
  name: { type: String, required: true, trim: true },
  regNo: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: String,
  password: { type: String, required: true },
  role: { type: String, enum: ["student", "admin"], default: "student" },
  active: { type: Boolean, default: true }
}, { timestamps: true }));

const CATS = ["Bags", "Wallets", "Electronics", "ID & Cards", "Keys", "Clothing", "Other"];
const itemSchema = (statuses) => new S({
  ref: { type: String, unique: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, enum: CATS, default: "Other" },
  description: { type: String, required: true },
  location: { type: String, required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: statuses, default: statuses[0] },
  reportedBy: { type: ID, ref: "Student", required: true }
}, { timestamps: true });

const LostItem = m.model("LostItem", itemSchema(["Missing", "Resolved", "Closed"]));
const FoundItem = m.model("FoundItem", itemSchema(["Found", "Reserved", "Returned", "Closed"]));

const Claim = m.model("Claim", new S({
  ref: { type: String, unique: true },
  foundItem: { type: ID, ref: "FoundItem", required: true },
  claimant: { type: ID, ref: "Student", required: true },
  reason: { type: String, required: true },
  identifyingMarks: { type: String, required: true },
  proofType: String,
  evidence: String,
  status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
  adminNote: String,
  reviewedBy: { type: ID, ref: "Student" }
}, { timestamps: true }));

const Notification = m.model("Notification", new S({
  user: { type: ID, ref: "Student" },   // a specific person...
  forRole: String,                      // ...or everyone with this role (e.g. "admin")
  text: { type: String, required: true },
  read: { type: Boolean, default: false }
}, { timestamps: true }));

const Counter = m.model("Counter", new S({ _id: String, n: { type: Number, default: 0 } }));
const nextRef = async (key, prefix) =>
  prefix + String((await Counter.findByIdAndUpdate(key, { $inc: { n: 1 } }, { new: true, upsert: true })).n).padStart(3, "0");

module.exports = { Student, LostItem, FoundItem, Claim, Notification, nextRef, CATS };

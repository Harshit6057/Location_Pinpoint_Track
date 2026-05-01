const path = require("path");
const express = require("express");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "location-data.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS points (
    id TEXT PRIMARY KEY,
    member_name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(member_name) REFERENCES members(name)
  );
`);

app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/member-login", (req, res) => {
  const name = normalizeName(req.body?.name || "");

  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  const now = new Date().toISOString();
  const insertMember = db.prepare(
    "INSERT OR IGNORE INTO members (name, created_at) VALUES (?, ?)"
  );
  insertMember.run(name, now);

  return res.json({ success: true, name });
});

app.get("/api/members", (_req, res) => {
  const rows = db.prepare("SELECT name FROM members ORDER BY name ASC").all();
  const members = rows.map((row) => row.name);
  res.json({ members });
});

app.post("/api/points", (req, res) => {
  const memberName = normalizeName(req.body?.memberName || "");
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const id = req.body?.id || cryptoId();
  const createdAt = req.body?.createdAt || new Date().toISOString();

  if (!memberName) {
    return res.status(400).json({ error: "memberName is required" });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "Valid lat/lng are required" });
  }

  db.prepare("INSERT OR IGNORE INTO members (name, created_at) VALUES (?, ?)").run(memberName, createdAt);
  db.prepare(
    "INSERT INTO points (id, member_name, lat, lng, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, memberName, lat, lng, createdAt);

  res.status(201).json({ success: true, id });
});

app.get("/api/points", (req, res) => {
  const memberName = normalizeName(req.query.memberName || "");
  const dateMode = String(req.query.dateMode || "ALL").toUpperCase();
  const date = String(req.query.date || "");

  const conditions = [];
  const params = [];

  if (memberName && memberName !== "ALL") {
    conditions.push("member_name = ?");
    params.push(memberName);
  }

  if (dateMode === "TODAY") {
    const today = toDateKey(new Date());
    conditions.push("substr(created_at, 1, 10) = ?");
    params.push(today);
  } else if (dateMode === "DATE" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    conditions.push("substr(created_at, 1, 10) = ?");
    params.push(date);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT id, member_name as memberName, lat, lng, created_at as createdAt
       FROM points
       ${whereClause}
       ORDER BY datetime(created_at) DESC`
    )
    .all(...params);

  res.json({ points: rows });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

function normalizeName(name) {
  return String(name).replace(/\s+/g, " ").trim();
}

function cryptoId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toDateKey(dateLike) {
  const value = new Date(dateLike);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

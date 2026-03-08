import dotenv from "dotenv";
dotenv.config({ override: true });
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z, ZodError } from "zod";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import pool from "./db.js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { WebSocketServer } from 'ws';
import { terminalManager } from './terminalManager.js';
import { runGitCommand } from './gitUtils.js';
import { lspManager } from './lspManager.js';
import { aiManager } from './aiManager.js';
import { buildPrompt } from './promptBuilders.js';
import { createServer } from 'http';
import Razorpay from "razorpay";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPOS_DIR = path.join(__dirname, 'repos');

const app = express();

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception thrown:", err);
  fs.writeFileSync('crash.log', String(err.stack || err));
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_1234567890abcdef";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "testsecret1234567890";
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(helmet());
app.use(pinoHttp({ level: "warn" }));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

const limiter = rateLimit({ windowMs: 60_000, max: 1000, standardHeaders: true, legacyHeaders: false });
app.use(limiter);

// ─────────────────────────────────────────────
// Helper Responses
// ─────────────────────────────────────────────
const ok = (res, data, statusCode = 200) =>
  res.status(statusCode).json({ success: true, data, message: data?.message || undefined });

const fail = (res, error, statusCode = 400) =>
  res.status(statusCode).json({ success: false, error });

// ─────────────────────────────────────────────
// Schema Bootstrap
// ─────────────────────────────────────────────
async function ensureSchema() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await pool.query(`CREATE EXTENSION IF NOT EXISTS citext`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      email       citext      UNIQUE NOT NULL,
      pass_hash   text        NOT NULL,
      display_name text,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      last_login  timestamptz,
      plan        text        NOT NULL DEFAULT 'FREE',
      plan_expiry timestamptz
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount        integer     NOT NULL, -- in paise
      currency      text        NOT NULL DEFAULT 'INR',
      status        text        NOT NULL DEFAULT 'pending',
      razorpay_order_id text    UNIQUE,
      razorpay_payment_id text  UNIQUE,
      razorpay_signature text,
      plan          text        NOT NULL,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      name        text        NOT NULL,
      owner_id    uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS room_members (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id     uuid        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role        text        NOT NULL DEFAULT 'EDITOR',
      joined_at   timestamptz NOT NULL DEFAULT now(),
      UNIQUE (room_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invitations (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id       uuid        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      invited_email citext      NOT NULL,
      invited_by    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role          text        NOT NULL DEFAULT 'EDITOR',
      token         text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
      status        text        NOT NULL DEFAULT 'pending',
      created_at    timestamptz NOT NULL DEFAULT now(),
      expires_at    timestamptz NOT NULL DEFAULT now() + interval '7 days',
      UNIQUE (room_id, invited_email)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_files (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id     uuid        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      name        text        NOT NULL,
      content     text        NOT NULL DEFAULT '',
      language    text        NOT NULL DEFAULT 'plaintext',
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS file_versions (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      file_id     uuid        NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
      content     text        NOT NULL,
      created_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_join_requests (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id     uuid        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message     text,
      status      text        NOT NULL DEFAULT 'pending',
      reviewed_by uuid        REFERENCES users(id) ON DELETE SET NULL,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      UNIQUE (room_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_sessions (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id     uuid        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role        text        NOT NULL DEFAULT 'VISITOR',
      started_at  timestamptz NOT NULL DEFAULT now(),
      expires_at  timestamptz NOT NULL DEFAULT now() + interval '2 hours',
      UNIQUE (room_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_usage (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_id     uuid        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      started_at  timestamptz NOT NULL DEFAULT now(),
      ended_at    timestamptz,
      duration    integer     DEFAULT 0,
      day         date        NOT NULL DEFAULT current_date
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_file_yjs_states (
      file_id     uuid        PRIMARY KEY REFERENCES project_files(id) ON DELETE CASCADE,
      state       bytea       NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  // ── Migrations: add columns if they don't exist yet ──────────────────────
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'FREE'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expiry timestamptz`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text`,
    `ALTER TABLE project_files ADD COLUMN IF NOT EXISTS content text NOT NULL DEFAULT ''`,
    `ALTER TABLE project_files ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'plaintext'`,
  ];
  for (const sql of migrations) {
    await pool.query(sql).catch(e => console.warn("Migration warning:", e.message));
  }

  console.log("\u2705 Schema ready");
}

ensureSchema().catch((e) => console.error("❌ Schema setup failed:", e.message));

// ─────────────────────────────────────────────
// Auth Middleware
// ─────────────────────────────────────────────
const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return fail(res, "Authorization header missing", 401);
  const token = header.split(" ")[1];
  if (!token) return fail(res, "Token missing", 401);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.sub || !/^[0-9a-fA-F-]{36}$/.test(payload.sub)) {
      return fail(res, "Invalid token payload", 401);
    }
    req.user = payload;
    next();
  } catch {
    return fail(res, "Invalid or expired token", 401);
  }
};

// ─────────────────────────────────────────────
// Zod Schemas
// ─────────────────────────────────────────────
const signupSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(6),
  display_name: z.string().min(1).max(100).nullish(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(200),
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
async function getRoomMembers(roomId) {
  const { rows } = await pool.query(
    `SELECT m.user_id AS "userId", m.role, m.joined_at AS "joinedAt",
            u.email, u.display_name AS "displayName",
            json_build_object('id', u.id, 'email', u.email, 'displayName', u.display_name) AS "user"
     FROM room_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.room_id = $1 ORDER BY m.joined_at ASC`,
    [roomId]
  );
  return rows;
}

async function checkMembership(roomId, userId) {
  const { rows } = await pool.query(
    `SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
  return rows[0] || null;
}

// ─────────────────────────────────────────────
// Health Routes
// ─────────────────────────────────────────────
app.get("/api/health/db", async (req, res) => {
  try { await pool.query("SELECT 1"); res.json({ success: true, backend: "ok", database: "connected" }); }
  catch (err) { res.status(503).json({ success: false, error: err.message }); }
});

// ─────────────────────────────────────────────
// Payment Routes
// ─────────────────────────────────────────────
app.post("/api/payment/create-order", auth, async (req, res) => {
  try {
    const { plan } = req.body || {};
    const mapping = { PRO: 150000, PREMIUM: 220000, ULTRA: 300000 };
    if (!plan || !mapping[plan]) return res.status(400).json({ error: "Invalid plan" });

    const amount = mapping[plan];
    if (RAZORPAY_KEY_ID.includes("rzp_test_1234567890")) {
      return res.json({ success: true, data: { orderId: `order_mock_${Date.now()}`, amount, currency: "INR", plan, keyId: RAZORPAY_KEY_ID, isTest: true } });
    }

    const order = await razorpay.orders.create({ amount, currency: "INR", receipt: `receipt_${Date.now()}`, notes: { plan, userId: req.user.sub } });
    await pool.query(`INSERT INTO payments (user_id, amount, currency, status, razorpay_order_id, plan) VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.sub, amount, "INR", "pending", order.id, plan]);

    res.json({ success: true, data: { orderId: order.id, amount: order.amount, currency: order.currency, plan, keyId: RAZORPAY_KEY_ID } });
  } catch (err) {
    console.error("Order creation failed:", err.message);
    res.status(500).json({ success: false, error: "Failed to create order" });
  }
});

app.post("/api/payment/verify", auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;
    const userId = req.user.sub;

    if (RAZORPAY_KEY_ID.includes("rzp_test_1234567890") && razorpay_order_id.startsWith("order_mock_")) {
      await pool.query("UPDATE users SET plan = $1, plan_expiry = now() + interval '30 days' WHERE id = $2", [plan, userId]);
      return res.json({ success: true, message: "Mock payment verified" });
    }

    const crypto = await import("crypto");
    const hmac = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    if (hmac.digest("hex") !== razorpay_signature) return res.status(400).json({ success: false, error: "Invalid signature" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE payments SET status = 'completed', razorpay_payment_id = $1, razorpay_signature = $2, updated_at = now() 
                         WHERE razorpay_order_id = $3 AND user_id = $4`, [razorpay_payment_id, razorpay_signature, razorpay_order_id, userId]);
      await client.query("UPDATE users SET plan = $1, plan_expiry = now() + interval '30 days' WHERE id = $2", [plan, userId]);
      await client.query("COMMIT");
    } finally { client.release(); }

    res.json({ success: true, message: "Payment verified" });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ─────────────────────────────────────────────
// Auth Routes
// ─────────────────────────────────────────────
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password, display_name } = signupSchema.parse(req.body);
    const emailNorm = email.trim().toLowerCase();
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [emailNorm]);
    if (existing.rows.length > 0) return fail(res, "Email already registered", 409);

    const passHash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(`INSERT INTO users (email, pass_hash, display_name) VALUES ($1, $2, $3) RETURNING id`, [emailNorm, passHash, display_name]);
    const token = jwt.sign({ sub: rows[0].id, email: emailNorm }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ success: true, data: { token, user: { id: rows[0].id, email: emailNorm, displayName: display_name } } });
  } catch (err) { res.status(err instanceof ZodError ? 400 : 500).json({ success: false, error: err.message }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    if (!rows[0] || !(await bcrypt.compare(password, rows[0].pass_hash))) return fail(res, "Invalid credentials", 401);
    const token = jwt.sign({ sub: rows[0].id, email: rows[0].email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, data: { token, user: { id: rows[0].id, email: rows[0].email, displayName: rows[0].display_name } } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get("/api/auth/me", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT id, email, display_name AS \"displayName\", plan, plan_expiry AS \"planExpiry\" FROM users WHERE id = $1", [req.user.sub]);
  if (!rows[0]) return fail(res, "User not found", 404);
  ok(res, rows[0]);
});

// ─────────────────────────────────────────────
// Workspace Routes
// ─────────────────────────────────────────────
app.get("/api/workspaces", auth, async (req, res) => {
  const { rows } = await pool.query(`SELECT r.* FROM rooms r JOIN room_members m ON m.room_id = r.id WHERE m.user_id = $1`, [req.user.sub]);
  const workspaces = await Promise.all(rows.map(async (r) => ({ ...r, members: await getRoomMembers(r.id) })));
  ok(res, workspaces);
});

app.post("/api/workspaces", auth, async (req, res) => {
  const { name } = createWorkspaceSchema.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`INSERT INTO rooms (name, owner_id) VALUES ($1, $2) RETURNING *`, [name, req.user.sub]);
    await client.query(`INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'OWNER')`, [rows[0].id, req.user.sub]);
    await client.query("COMMIT");
    ok(res, rows[0], 201);
  } finally { client.release(); }
});

app.get("/api/workspaces/:id", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM rooms WHERE id = $1", [req.params.id]);
  if (!rows[0]) return fail(res, "Not found", 404);
  const members = await getRoomMembers(req.params.id);
  ok(res, { ...rows[0], members });
});

app.patch("/api/workspaces/:id", auth, async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return fail(res, "Name is required");
  const membership = await checkMembership(req.params.id, req.user.sub);
  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) return fail(res, "Unauthorized", 403);
  const { rows } = await pool.query("UPDATE rooms SET name = $1, updated_at = now() WHERE id = $2 RETURNING *", [name.trim(), req.params.id]);
  if (!rows[0]) return fail(res, "Not found", 404);
  ok(res, rows[0]);
});

app.post("/api/workspaces/:id/invite", auth, async (req, res) => {
  const { email, role } = req.body;
  const workspaceId = req.params.id;
  await pool.query(`INSERT INTO invitations (room_id, invited_email, invited_by, role) VALUES ($1, $2, $3, $4) ON CONFLICT (room_id, invited_email) DO UPDATE SET role = EXCLUDED.role, status = 'pending'`,
    [workspaceId, email.toLowerCase(), req.user.sub, role || 'EDITOR']);
  ok(res, { message: "Invitation sent" });
});

app.get("/api/invitations", auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT 
      i.id, i.role, i.status, i.created_at AS "createdAt",
      i.room_id AS "workspaceId",
      json_build_object('id', r.id, 'name', r.name) AS "workspace",
      json_build_object('id', u.id, 'email', u.email, 'displayName', u.display_name) AS "invitedBy"
    FROM invitations i 
    JOIN rooms r ON r.id = i.room_id 
    JOIN users u ON u.id = i.invited_by
    WHERE i.invited_email = $1 AND i.status = 'pending'`,
    [req.user.email.toLowerCase()]);
  ok(res, rows);
});

app.post("/api/invitations/:id/accept", auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM invitations WHERE id = $1 AND invited_email = $2 AND status = 'pending'", [req.params.id, req.user.email.toLowerCase()]);
    if (!rows[0]) throw new Error("Invitation not found");
    await client.query("INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (room_id, user_id) DO UPDATE SET role = EXCLUDED.role",
      [rows[0].room_id, req.user.sub, rows[0].role]);
    await client.query("UPDATE invitations SET status = 'accepted' WHERE id = $1", [req.params.id]);
    await client.query("COMMIT");
    ok(res, { message: "Invitation accepted" });
  } catch (err) {
    await client.query("ROLLBACK");
    fail(res, err.message);
  } finally { client.release(); }
});

app.post("/api/invitations/:id/reject", auth, async (req, res) => {
  const { rows } = await pool.query("UPDATE invitations SET status = 'rejected' WHERE id = $1 AND invited_email = $2 RETURNING *", [req.params.id, req.user.email.toLowerCase()]);
  if (!rows[0]) return fail(res, "Invitation not found");
  ok(res, { message: "Invitation rejected" });
});

app.post("/api/workspaces/request-access", auth, async (req, res) => {
  const { workspaceId, message } = req.body;
  await pool.query(`INSERT INTO workspace_join_requests (room_id, user_id, message) VALUES ($1, $2, $3) ON CONFLICT (room_id, user_id) DO UPDATE SET message = EXCLUDED.message, status = 'pending'`,
    [workspaceId, req.user.sub, message || '']);
  ok(res, { message: "Request sent" });
});

app.get("/api/workspaces/:id/requests", auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT jr.*, u.email, u.display_name AS "displayName" 
    FROM workspace_join_requests jr 
    JOIN users u ON u.id = jr.user_id 
    WHERE jr.room_id = $1 AND jr.status = 'pending'`, [req.params.id]);
  ok(res, rows);
});

app.post("/api/requests/:id/approve", auth, async (req, res) => {
  const { role } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM workspace_join_requests WHERE id = $1", [req.params.id]);
    if (!rows[0]) throw new Error("Request not found");
    await client.query("INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (room_id, user_id) DO UPDATE SET role = EXCLUDED.role",
      [rows[0].room_id, rows[0].user_id, role || 'MEMBER']);
    await client.query("UPDATE workspace_join_requests SET status = 'approved', reviewed_by = $1 WHERE id = $2", [req.user.sub, req.params.id]);
    await client.query("COMMIT");
    ok(res, { message: "Request approved" });
  } catch (err) {
    await client.query("ROLLBACK");
    fail(res, err.message);
  } finally { client.release(); }
});

app.post("/api/requests/:id/reject", auth, async (req, res) => {
  await pool.query("UPDATE workspace_join_requests SET status = 'rejected', reviewed_by = $1 WHERE id = $2", [req.user.sub, req.params.id]);
  ok(res, { message: "Request rejected" });
});

app.delete("/api/workspaces/:id/members/:userId", auth, async (req, res) => {
  // Only OWNER or ADMIN can remove members
  const requesterMembership = await checkMembership(req.params.id, req.user.sub);
  if (!requesterMembership || !['OWNER', 'ADMIN'].includes(requesterMembership.role)) return fail(res, "Unauthorized", 403);
  // Can't remove the OWNER
  const target = await checkMembership(req.params.id, req.params.userId);
  if (target?.role === 'OWNER') return fail(res, "Cannot remove the workspace owner", 403);
  const { rows } = await pool.query("DELETE FROM room_members WHERE room_id = $1 AND user_id = $2 RETURNING *", [req.params.id, req.params.userId]);
  if (!rows[0]) return fail(res, "Member not found");
  ok(res, { message: "Member removed" });
});

// PUT and PATCH both work for role updates
const handleRoleUpdate = async (req, res) => {
  const { role } = req.body;
  const validRoles = ['ADMIN', 'EDITOR', 'MEMBER', 'VIEWER', 'VISITOR'];
  if (!role || !validRoles.includes(role)) return fail(res, `Invalid role. Must be one of: ${validRoles.join(', ')}`);

  // Only OWNER or ADMIN can change roles
  const requesterMembership = await checkMembership(req.params.id, req.user.sub);
  if (!requesterMembership || !['OWNER', 'ADMIN'].includes(requesterMembership.role)) return fail(res, "Unauthorized — only OWNER or ADMIN can change roles", 403);

  // ADMIN cannot change OWNER's role
  const targetMembership = await checkMembership(req.params.id, req.params.userId);
  if (targetMembership?.role === 'OWNER') return fail(res, "Cannot change the OWNER's role", 403);

  const { rows } = await pool.query(
    "UPDATE room_members SET role = $1 WHERE room_id = $2 AND user_id = $3 RETURNING *",
    [role, req.params.id, req.params.userId]
  );
  if (!rows[0]) return fail(res, "Member not found");
  ok(res, { message: "Role updated" });
};

app.put("/api/workspaces/:id/members/:userId/role", auth, handleRoleUpdate);
app.patch("/api/workspaces/:id/members/:userId", auth, handleRoleUpdate);

app.get("/api/workspaces/:id/collab-token", auth, async (req, res) => {
  const membership = await checkMembership(req.params.id, req.user.sub);
  if (!membership) return fail(res, "Unauthorized", 403);
  const token = jwt.sign({ sub: req.user.sub, role: membership.role, docId: req.params.id, typ: "collab" }, JWT_SECRET, { expiresIn: "1h" });
  ok(res, { token });
});

// ─────────────────────────────────────────────
// File Routes
// ─────────────────────────────────────────────
app.get("/api/workspaces/:id/files", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM project_files WHERE room_id = $1 ORDER BY created_at ASC", [req.params.id]);
  ok(res, rows);
});

app.post("/api/workspaces/:id/files", auth, async (req, res) => {
  const { name, content, language } = req.body;
  const { rows } = await pool.query(`INSERT INTO project_files (room_id, name, content, language) VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.params.id, name, content || "", language || "plaintext"]);
  // Broadcast to all users watching this workspace
  broadcastToWorkspace(req.params.id, { type: 'file_created', payload: rows[0] });
  ok(res, rows[0], 201);
});

app.get("/api/files/:id", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM project_files WHERE id = $1", [req.params.id]);
  if (!rows[0]) return fail(res, "Not found", 404);
  ok(res, rows[0]);
});

// Support both PUT and PATCH for file updates
const handleFileUpdate = async (req, res) => {
  const { content, name, language } = req.body;
  const sets = [];
  const vals = [];
  let i = 1;
  if (content !== undefined) { sets.push(`content = $${i++}`); vals.push(content); }
  if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
  if (language !== undefined) { sets.push(`language = $${i++}`); vals.push(language); }
  sets.push(`updated_at = now()`);
  vals.push(req.params.id);
  const { rows } = await pool.query(`UPDATE project_files SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
  if (!rows[0]) return fail(res, "Not found", 404);
  // Broadcast rename events so other users' file trees update
  if (name !== undefined) {
    broadcastToWorkspace(rows[0].room_id, { type: 'file_renamed', payload: { id: rows[0].id, name: rows[0].name, room_id: rows[0].room_id } });
  }
  ok(res, rows[0]);
};
app.put("/api/files/:id", auth, handleFileUpdate);
app.patch("/api/files/:id", auth, handleFileUpdate);

app.delete("/api/files/:id", auth, async (req, res) => {
  const { rows } = await pool.query("DELETE FROM project_files WHERE id = $1 RETURNING *", [req.params.id]);
  if (!rows[0]) return fail(res, "Not found", 404);
  // Broadcast to all users watching this workspace
  broadcastToWorkspace(rows[0].room_id, { type: 'file_deleted', payload: { id: rows[0].id, room_id: rows[0].room_id } });
  ok(res, { message: "File deleted" });
});

app.get("/api/files/:id/versions", auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT v.*, u.email AS "userEmail" FROM file_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.file_id = $1 ORDER BY v.created_at DESC LIMIT 50`,
    [req.params.id]
  );
  ok(res, rows);
});

app.post("/api/files/:id/restore", auth, async (req, res) => {
  const { versionId } = req.body;
  const { rows: vRows } = await pool.query("SELECT content FROM file_versions WHERE id = $1 AND file_id = $2", [versionId, req.params.id]);
  if (!vRows[0]) return fail(res, "Version not found", 404);
  const { rows } = await pool.query("UPDATE project_files SET content = $1, updated_at = now() WHERE id = $2 RETURNING *", [vRows[0].content, req.params.id]);
  ok(res, rows[0]);
});

// ─────────────────────────────────────────────
// Workspace delete
// ─────────────────────────────────────────────
app.delete("/api/workspaces/:id", auth, async (req, res) => {
  const membership = await checkMembership(req.params.id, req.user.sub);
  if (!membership || membership.role !== 'OWNER') return fail(res, "Unauthorized", 403);
  await pool.query("DELETE FROM rooms WHERE id = $1", [req.params.id]);
  ok(res, { message: "Workspace deleted" });
});

// ─────────────────────────────────────────────
// Activity / Audit Log
// ─────────────────────────────────────────────
app.get("/api/workspaces/:id/activity", auth, async (req, res) => {
  // Return recent file updates as activity items
  const { rows } = await pool.query(`
    SELECT 
      f.id, f.name AS "fileName", f.updated_at AS "createdAt",
      'FILE_UPDATED' AS "actionType",
      json_build_object('id', u.id, 'email', u.email) AS "user"
    FROM project_files f
    JOIN rooms r ON r.id = f.room_id
    JOIN users u ON u.id = r.owner_id
    WHERE f.room_id = $1
    ORDER BY f.updated_at DESC
    LIMIT 20
  `, [req.params.id]);
  ok(res, rows);
});

// ─────────────────────────────────────────────
// Workspace Export
// ─────────────────────────────────────────────
app.get("/api/workspaces/:id/export", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT name, content, language FROM project_files WHERE room_id = $1", [req.params.id]);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="workspace-${req.params.id}.json"`);
  res.json(rows);
});

// ─────────────────────────────────────────────
// Workspace Search
// ─────────────────────────────────────────────
app.post("/api/workspaces/:id/search", auth, async (req, res) => {
  const { query } = req.body;
  if (!query) return ok(res, []);
  const { rows } = await pool.query(
    `SELECT id, name, language, LEFT(content, 200) AS snippet FROM project_files WHERE room_id = $1 AND (name ILIKE $2 OR content ILIKE $2) LIMIT 20`,
    [req.params.id, `%${query}%`]
  );
  ok(res, rows);
});

// ─────────────────────────────────────────────
// Presence (stub — Yjs awareness handles real presence)
// ─────────────────────────────────────────────
app.post("/api/workspaces/:id/presence/enter", auth, async (req, res) => ok(res, { ok: true }));
app.post("/api/workspaces/:id/presence/leave", auth, async (req, res) => ok(res, { ok: true }));
app.get("/api/workspaces/:id/presence", auth, async (req, res) => ok(res, []));

// ─────────────────────────────────────────────
// Usage Routes
// ─────────────────────────────────────────────
app.get("/api/usage/status", auth, async (req, res) => {
  const userId = req.user.sub;
  const { rows } = await pool.query(
    "SELECT COALESCE(SUM(duration), 0) AS total_seconds FROM workspace_usage WHERE user_id = $1 AND day = CURRENT_DATE",
    [userId]
  );

  const userRows = await pool.query("SELECT plan FROM users WHERE id = $1", [userId]);
  const plan = userRows.rows[0]?.plan || "FREE";

  // 2 hours = 7200 seconds
  const isLimited = plan === "FREE";
  const limitSeconds = 7200;
  const totalSeconds = parseInt(rows[0].total_seconds, 10);
  const remainingSeconds = Math.max(0, limitSeconds - totalSeconds);
  const exceeded = isLimited && totalSeconds >= limitSeconds;

  res.json({
    success: true,
    data: {
      totalSeconds,
      limitSeconds,
      remainingSeconds,
      exceeded,
      plan
    }
  });
});

app.post("/api/usage/report", auth, async (req, res) => {
  const { workspaceId, seconds } = req.body;
  if (!workspaceId || !seconds) return fail(res, "Missing workspaceId or seconds");

  await pool.query(
    `INSERT INTO workspace_usage (user_id, room_id, duration, day)
     VALUES ($1, $2, $3, CURRENT_DATE)`,
    [req.user.sub, workspaceId, seconds]
  );

  res.json({ success: true });
});

// ─────────────────────────────────────────────
// AI & Git APIs
// ─────────────────────────────────────────────
app.post("/api/ai/ask", auth, async (req, res) => {
  const { action, context } = req.body;
  const prompt = buildPrompt(action, context);
  const response = await aiManager.generateResponse(prompt, context);
  res.json({ response });
});

app.get("/api/workspaces/:id/git/status", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM project_files WHERE room_id = $1", [req.params.id]);
  const status = await runGitCommand(req.params.id, rows, 'git status --porcelain');
  res.json({ status });
});

// ─────────────────────────────────────────────
// Server Start & WebSockets
// ─────────────────────────────────────────────
app.use("/api", (req, res) => res.status(404).json({ success: false, error: "Route not found" }));

// ─────────────────────────────────────────────
// Root Health Check Route
// ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("CollabCode Backend Running Successfully");
});

const httpServer = createServer(app);
const lspWss = new WebSocketServer({ noServer: true });
const termWss = new WebSocketServer({ noServer: true });
const collabWss = new WebSocketServer({ noServer: true });

// ─────────────────────────────────────────────
// Workspace Broadcast System
// ─────────────────────────────────────────────
// Map of workspaceId → Set of WebSocket clients
const workspaceClients = new Map();

function broadcastToWorkspace(workspaceId, data) {
  const clients = workspaceClients.get(workspaceId);
  if (!clients || clients.size === 0) return;
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      try { ws.send(msg); } catch { /* ignore */ }
    }
  }
}

httpServer.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/lsp') {
    lspWss.handleUpgrade(request, socket, head, (ws) => {
      lspWss.emit('connection', ws, request);
    });
  } else if (pathname === '/terminal') {
    termWss.handleUpgrade(request, socket, head, (ws) => {
      termWss.emit('connection', ws, request);
    });
  } else if (pathname === '/ws') {
    collabWss.handleUpgrade(request, socket, head, (ws) => {
      collabWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Workspace-level collaboration WebSocket (file-tree sync)
collabWss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const workspaceId = url.searchParams.get('workspaceId');
  const token = url.searchParams.get('token');
  if (!workspaceId || !token) return ws.close(1008, 'Missing params');
  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    return ws.close(1008, 'Invalid token');
  }

  // Register client in workspace room
  if (!workspaceClients.has(workspaceId)) workspaceClients.set(workspaceId, new Set());
  workspaceClients.get(workspaceId).add(ws);

  ws.on('close', () => {
    const clients = workspaceClients.get(workspaceId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) workspaceClients.delete(workspaceId);
    }
  });

  ws.on('error', () => {
    const clients = workspaceClients.get(workspaceId);
    if (clients) clients.delete(ws);
  });

  // Send a welcome/connected message
  ws.send(JSON.stringify({ type: 'connected', workspaceId }));
});

lspWss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const workspaceId = url.searchParams.get('workspaceId');
  const token = url.searchParams.get('token');
  if (!workspaceId || !token) return ws.close(1008, 'Missing params');
  try {
    jwt.verify(token, JWT_SECRET);
    const repoDir = path.join(REPOS_DIR, workspaceId);
    if (!fs.existsSync(repoDir)) fs.mkdirSync(repoDir, { recursive: true });

    // Sync files
    const { rows: files } = await pool.query("SELECT name, content FROM project_files WHERE room_id = $1", [workspaceId]);
    for (const file of files) {
      const filePath = path.join(repoDir, file.name);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, file.content);
    }
    lspManager.startServer(workspaceId, repoDir, ws);
  } catch (err) { ws.close(1008, 'Invalid token'); }
});

termWss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const workspaceId = url.searchParams.get('workspaceId');
  const token = url.searchParams.get('token');
  if (!workspaceId || !token) return ws.close(1008, 'Missing params');
  try {
    jwt.verify(token, JWT_SECRET);
    const workspaceDir = path.join(process.cwd(), 'workspaces', workspaceId);
    if (!fs.existsSync(workspaceDir)) fs.mkdirSync(workspaceDir, { recursive: true });
    let session = terminalManager.getSession(workspaceId);
    if (!session) {
      session = await terminalManager.createSession(workspaceId, workspaceDir);
      session.start();
    }
    const onData = (data) => ws.send(JSON.stringify({ type: 'data', data }));
    const onExit = (code) => ws.send(JSON.stringify({ type: 'exit', code }));
    session.on('data', onData);
    session.on('exit', onExit);
    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message);
        if (msg.type === 'data') session.write(msg.data);
        else if (msg.type === 'resize') session.resize(msg.cols, msg.rows);
      } catch { }
    });
    ws.on('close', () => {
      session.removeListener('data', onData);
      session.removeListener('exit', onExit);
    });
  } catch (err) { ws.close(1008, 'Invalid token'); }
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

setInterval(() => { }, 10000);

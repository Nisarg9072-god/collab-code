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
});

const PORT = process.env.PORT || 3001;
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
      plan        text        NOT NULL DEFAULT 'FREE'
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
  email: z.string().email(),
  password: z.string().min(6),
  display_name: z.string().min(1).max(100).optional(),
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
    `SELECT m.id, m.room_id AS "workspaceId", m.user_id AS "userId", m.role, m.joined_at AS "joinedAt",
            json_build_object('id', u.id, 'email', u.email, 'displayName', u.display_name, 'createdAt', u.created_at) AS "user"
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
      await pool.query("UPDATE users SET plan = $1 WHERE id = $2", [plan, userId]);
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
      await client.query("UPDATE users SET plan = $1 WHERE id = $2", [plan, userId]);
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
  const { rows } = await pool.query("SELECT id, email, display_name AS \"displayName\", plan FROM users WHERE id = $1", [req.user.sub]);
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

// ─────────────────────────────────────────────
// File Routes
// ─────────────────────────────────────────────
app.get("/api/workspaces/:id/files", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM project_files WHERE room_id = $1", [req.params.id]);
  ok(res, rows);
});

app.post("/api/workspaces/:id/files", auth, async (req, res) => {
  const { name, content, language } = req.body;
  const { rows } = await pool.query(`INSERT INTO project_files (room_id, name, content, language) VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.params.id, name, content || "", language || "plaintext"]);
  ok(res, rows[0], 201);
});

app.get("/api/files/:id", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM project_files WHERE id = $1", [req.params.id]);
  if (!rows[0]) return fail(res, "Not found", 404);
  ok(res, rows[0]);
});

app.put("/api/files/:id", auth, async (req, res) => {
  const { content } = req.body;
  const { rows } = await pool.query(`UPDATE project_files SET content = $1, updated_at = now() WHERE id = $2 RETURNING *`, [content, req.params.id]);
  ok(res, rows[0]);
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
app.use((req, res) => res.status(404).json({ success: false, error: "Route not found" }));

const httpServer = createServer(app);
const lspWss = new WebSocketServer({ noServer: true });
const termWss = new WebSocketServer({ noServer: true });

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
  } else {
    socket.destroy();
  }
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

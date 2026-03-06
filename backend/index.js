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
import { spawn } from "child_process";
import { WebSocketServer } from 'ws';
import { terminalManager } from './terminalManager.js';
import { runGitCommand } from './gitUtils.js';
import { lspManager } from './lspManager.js';
import { aiManager } from './aiManager.js';
import { buildPrompt } from './promptBuilders.js';
import { createServer } from 'http';
import { URL } from 'url';

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);
const REPOS_DIR = path.join(__dirname, 'repos');
import Razorpay from "razorpay";

// duplicate dotenv import removed
/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication and user identity
 *     description: Authentication and user identity
 *   - name: Documents
 *     description: Document lifecycle and access control
 *   - name: History
 *     description: Snapshots and audit logs
 */
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception thrown:", err);
});

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
const DEMO_AUTH = process.env.DEMO_AUTH === "true";
if (DEMO_AUTH) {
  console.log("Auth: DEMO_AUTH enabled (no DB required for login/register)");
}
const demoStore = {
  workspaces: new Map(),
  members: new Map(),
  files: new Map(),
  activities: new Map()
};
const demoId = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
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
app.use(pinoHttp({ level: "warn" })); // suppress info noise

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow any localhost port + no-origin (curl/Postman)
      if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));

const limiter = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false });
app.use(limiter);

// ─────────────────────────────────────────────
// Helper: structured JSON response
// ─────────────────────────────────────────────
const ok = (res, data, statusCode = 200) =>
  res.status(statusCode).json({ success: true, data, message: data?.message || undefined });

const fail = (res, error, statusCode = 400) =>
  res.status(statusCode).json({ success: false, error });

// ─────────────────────────────────────────────
// Schema bootstrap (idempotent)
// ─────────────────────────────────────────────
async function ensureSchema() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await pool.query(`CREATE EXTENSION IF NOT EXISTS citext`);

  // users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      email       citext      UNIQUE NOT NULL,
      pass_hash   text        NOT NULL,
      display_name text,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      last_login  timestamptz
    )
  `);

  // auto-update updated_at
  await pool.query(`
    CREATE OR REPLACE FUNCTION _set_updated_at() RETURNS trigger AS $$
    BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql
  `);

  for (const tbl of ["users", "rooms", "project_files"]) {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_${tbl}_upd') THEN
          CREATE TRIGGER trg_${tbl}_upd
          BEFORE UPDATE ON ${tbl}
          FOR EACH ROW EXECUTE FUNCTION _set_updated_at();
        END IF;
      END$$
    `).catch(() => { }); // ignore if table doesn't exist yet
  }

  // rooms (workspaces)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      name        text        NOT NULL,
      owner_id    uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  // room members
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

  // Migrate any old MEMBER rows to EDITOR (MEMBER is not a valid role)
  await pool.query(`
    UPDATE room_members SET role = 'EDITOR'
    WHERE role NOT IN ('OWNER','ADMIN','EDITOR','VIEWER','VISITOR')
  `).catch(() => { });

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rm_room ON room_members(room_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rm_user ON room_members(user_id)`);

  // invitations (pending — for users who don't have accounts yet)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invitations (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id       uuid        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      invited_email citext      NOT NULL,
      invited_by    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role          text        NOT NULL DEFAULT 'MEMBER',
      token         text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
      status        text        NOT NULL DEFAULT 'pending',
      created_at    timestamptz NOT NULL DEFAULT now(),
      expires_at    timestamptz NOT NULL DEFAULT now() + interval '7 days',
      UNIQUE (room_id, invited_email)
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inv_email ON invitations(invited_email)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inv_token ON invitations(token)`);

  // project files
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

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pf_room ON project_files(room_id)`);

  // file versions (for future version history)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS file_versions (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      file_id     uuid        NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
      content     text        NOT NULL,
      created_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fv_file ON file_versions(file_id)`);

  // workspace join requests (for users who want to join without an invite)
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_jr_room ON workspace_join_requests(room_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_jr_user ON workspace_join_requests(user_id)`);

  // workspace sessions (for time-limited visitor access)
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ws_room ON workspace_sessions(room_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ws_user ON workspace_sessions(user_id)`);

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
const zEmail = z.string().email("Invalid email address");
const zPassword = z.string().min(6, "Password must be at least 6 characters");
const zUuid = z.string().uuid("Invalid ID format");

const signupSchema = z.object({
  email: zEmail,
  password: zPassword,
  display_name: z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email: zEmail,
  password: z.string().min(1, "Password is required"),
});

const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required").max(200),
});

// Valid roles — OWNER is system-assigned only, not invitable
const VALID_ROLES = ["ADMIN", "EDITOR", "VIEWER", "VISITOR"];
const VALID_ROLES_ALL = ["OWNER", "ADMIN", "EDITOR", "VIEWER", "VISITOR"];

const inviteSchema = z.object({
  email: zEmail,
  role: z.enum(["ADMIN", "EDITOR", "VIEWER", "VISITOR"]).default("EDITOR"),
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
async function getRoomMembers(roomId) {
  const { rows } = await pool.query(
    `SELECT
       m.id,
       m.room_id              AS "workspaceId",
       m.user_id              AS "userId",
       m.role,
       m.joined_at            AS "joinedAt",
       json_build_object(
         'id',          u.id,
         'email',       u.email,
         'displayName', u.display_name,
         'createdAt',   u.created_at
       )                      AS "user"
     FROM room_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.room_id = $1
     ORDER BY m.joined_at ASC`,
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
// Health
// ─────────────────────────────────────────────
app.get("/api/health/db", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ success: true, data: { backend: "ok", database: "connected" } });
  } catch (err) {
    res.status(503).json({ success: false, error: "Database disconnected", detail: err.message });
  }
});

app.get("/api/health/users", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM users");
    res.json({ success: true, data: { table: "users", count: rows[0].count } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Routes

// Payments (Test Mode): Create Razorpay Order
app.post("/create-order", async (req, res) => {
  try {
    const { plan } = req.body || {};
    const mapping = {
      PRO: 1500 * 100,
      PREMIUM: 2200 * 100,
      ULTRA: 3000 * 100,
    };
    if (!plan || !mapping[plan]) {
      return res.status(400).json({ error: "Invalid plan" });
    }
    const order = await razorpay.orders.create({
      amount: mapping[plan],
      currency: "INR",
      receipt: `order_${plan}_${Date.now()}`,
      notes: { plan },
      payment_capture: 1,
    });
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      plan,
      planName: plan,
      keyId: RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("Failed to create Razorpay order:", err?.message || err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Mirror under /api for consistency
app.post("/api/create-order", async (req, res) => {
  req.url = "/create-order";
  app._router.handle(req, res);
});

// Register
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 */
app.post("/api/auth/register", async (req, res, next) => {
// ─────────────────────────────────────────────
// Auth Routes
// ─────────────────────────────────────────────
// REGISTER (alias: signup)
const _registerHandler = async (req, res) => {
  try {
    const { email, password } = registerSchema.parse(req.body);
    if (DEMO_AUTH) {
      const demoId = `demo_${Buffer.from(email).toString("hex").slice(0, 16)}`;
      const token = jwt.sign({ sub: demoId, email }, JWT_SECRET, { expiresIn: "1h" });
      return res.status(201).json({
        token,
        user: { id: demoId, email }
      });
    }

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.error(`[Auth Error] Email already exists: ${email}`);
      return res.status(409).json({ error: "Email already exists" });
    const { email, password, display_name } = signupSchema.parse(req.body);
    const emailNorm = email.trim().toLowerCase();

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [emailNorm]);
    if (existing.rows.length > 0) {
      return fail(res, "Email already registered. Try logging in instead.", 409);
    }

    const passHash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (email, pass_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, created_at`,
      [emailNorm, passHash, display_name || null]
    );
    const user = rows[0];

    // If this email had pending invitations, auto-accept them
    await _acceptPendingInvitations(emailNorm, user.id).catch(() => { });

    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    return ok(res, { token, user: { id: user.id, email: user.email, displayName: user.display_name, createdAt: user.created_at } }, 201);
  } catch (err) {
    console.error("[Auth Error] Register failed:", err);
    const msg = String(err && err.message ? err.message : "");
    if (
      err.code === 'P1001' ||
      err.code === 'P1000' ||
      msg.includes("Can't reach database") ||
      msg.includes("Authentication failed against database server")
    ) {
      return res.status(503).json({ error: "Database connection failed. Please check credentials and that PostgreSQL is running." });
    }
    res.status(500).json({ error: "server error" });
    if (err instanceof ZodError) return fail(res, err.errors[0]?.message || "Invalid input");
    console.error("[Register]", err.message);
    return fail(res, "Registration failed. Please try again.", 500);
  }
};

app.post("/api/auth/signup", _registerHandler);
app.post("/api/auth/register", _registerHandler);

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    if (DEMO_AUTH) {
      const demoId = `demo_${Buffer.from(email).toString("hex").slice(0, 16)}`;
      const token = jwt.sign({ sub: demoId, email }, JWT_SECRET, { expiresIn: "1h" });
      console.log(`[Auth] Demo user logged in: ${demoId}`);
      return res.json({
        token,
        user: { id: demoId, email }
      });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      console.error(`[Auth Error] User not found: ${email}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const emailNorm = email.trim().toLowerCase();

    const { rows } = await pool.query(
      "SELECT id, email, pass_hash, display_name, created_at FROM users WHERE email = $1",
      [emailNorm]
    );
    const user = rows[0];
    if (!user) return fail(res, "Invalid email or password", 401);

    const valid = await bcrypt.compare(password, user.pass_hash);
    if (!valid) return fail(res, "Invalid email or password", 401);

    await pool.query("UPDATE users SET last_login = now() WHERE id = $1", [user.id]);
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

    return ok(res, {
      token,
      user: { id: user.id, email: user.email, displayName: user.display_name, createdAt: user.created_at },
    });
  } catch (err) {
    console.error("[Auth Error] Login failed:", err);
    const msg = String(err && err.message ? err.message : "");
    if (
      err.code === 'P1001' ||
      err.code === 'P1000' ||
      msg.includes("Can't reach database") ||
      msg.includes("Authentication failed against database server")
    ) {
      return res.status(503).json({ error: "Database connection failed. Please check credentials and that PostgreSQL is running." });
    }
    next(err);
  }
});

// --- AI APIs ---

app.post("/api/ai/ask", auth, async (req, res, next) => {
  try {
    const { action, context } = req.body;
    if (!action || !context) {
      return res.status(400).json({ error: "Missing action or context" });
    }

    const prompt = buildPrompt(action, context);
    const response = await aiManager.generateResponse(prompt, context);
    
    res.json({ response });
  } catch (err) {
    next(err);
  }
});

// Code Review – returns structured JSON issues
app.post("/api/ai/review", auth, async (req, res, next) => {
  try {
    const { code, language, fileName, workspaceId, fileList, workspaceName } = req.body;
    if (!code || !language || !fileName) {
      return res.status(400).json({ error: "Missing code, language, or fileName" });
    }

    const prompt = buildPrompt('review', { 
      fullCode: code, language, fileName, workspaceId, fileList, workspaceName 
    });
    const rawResponse = await aiManager.generateResponse(prompt, {});

    // Try to extract JSON from the response (AI may wrap it in markdown)
    let issues = [];
    let parseError = null;
    try {
      // Strip any markdown code fences the model may have added
      const cleaned = rawResponse.replace(/^```(?:json)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      issues = JSON.parse(cleaned);
      if (!Array.isArray(issues)) issues = [];
    } catch (e) {
      parseError = rawResponse; // surface the raw text so UI can display it
    }

    res.json({ issues, parseError });
  } catch (err) {
    next(err);
  }
});

// AI Commit Message – returns 1-3 concise commit message suggestions from diff
app.post("/api/ai/commit-message", auth, async (req, res, next) => {
  try {
    const { changedFiles, diffSummary } = req.body;
    if (!changedFiles || !Array.isArray(changedFiles)) {
      return res.status(400).json({ error: "Missing changedFiles array" });
    }

    const prompt = buildPrompt('commitMessage', { changedFiles, diffSummary: diffSummary || '' });
    const rawResponse = await aiManager.generateResponse(prompt, {});

    let suggestions = [];
    let parseError = null;
    try {
      const cleaned = rawResponse.replace(/^```(?:json)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      suggestions = JSON.parse(cleaned);
      if (!Array.isArray(suggestions)) suggestions = [];
      // Ensure we only keep string items and at most 3
      suggestions = suggestions.filter(s => typeof s === 'string').slice(0, 3);
    } catch (e) {
      parseError = rawResponse;
    }

    res.json({ suggestions, parseError });
  } catch (err) {
    next(err);
  }
});

// AI Semantic Search – intent-based file relevance ranking
app.post("/api/ai/semantic-search", auth, async (req, res, next) => {
  try {
    const { query, fileList, workspaceId, workspaceName } = req.body;
    if (!query || !fileList || !Array.isArray(fileList)) {
      return res.status(400).json({ error: "Missing query or fileList" });
    }

    const prompt = buildPrompt('semanticSearch', { query, fileList, workspaceName: workspaceName || '' });
    const rawResponse = await aiManager.generateResponse(prompt, {});

    let matches = [];
    let parseError = null;
    try {
      const cleaned = rawResponse.replace(/^```(?:json)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      matches = JSON.parse(cleaned);
      if (!Array.isArray(matches)) matches = [];
      // Validate shape and clamp to 8
      matches = matches
        .filter(m => m && typeof m.fileName === 'string' && typeof m.reason === 'string')
        .slice(0, 8);
    } catch (e) {
      parseError = rawResponse;
    }

    res.json({ matches, parseError });
  } catch (err) {
    next(err);
  }
});

// Multi-file AI Review – cross-file issues, architecture concerns, integration risks
app.post("/api/ai/multi-review", auth, async (req, res, next) => {
  try {
    const { currentFile, relatedFiles } = req.body;
    if (!currentFile || !currentFile.name) {
      return res.status(400).json({ error: "Missing currentFile" });
    }

    const prompt = buildPrompt('multiFileReview', { currentFile, relatedFiles: relatedFiles || [] });
    const rawResponse = await aiManager.generateResponse(prompt, {});

    let result = null;
    let parseError = null;
    try {
      const cleaned = rawResponse.replace(/^```(?:json)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      result = JSON.parse(cleaned);
      // Validate and normalise the shape
      if (typeof result !== 'object' || Array.isArray(result)) result = null;
      if (result) {
        result.crossFileIssues = Array.isArray(result.crossFileIssues) ? result.crossFileIssues : [];
        result.architectureSuggestions = Array.isArray(result.architectureSuggestions) ? result.architectureSuggestions : [];
        result.integrationRisks = Array.isArray(result.integrationRisks) ? result.integrationRisks : [];
        result.summary = typeof result.summary === 'string' ? result.summary : '';
      }
    } catch (e) {
      parseError = rawResponse;
    }

    res.json({ result, parseError });
  } catch (err) {
    next(err);
  }
});

// Project / Module Summary – high-level explanation, key files, flows, risks
app.post("/api/ai/project-summary", auth, async (req, res, next) => {
  try {
    const { workspaceName, fileList, currentFileName } = req.body;
    if (!fileList || !Array.isArray(fileList)) {
      return res.status(400).json({ error: "Missing fileList" });
    }

    const prompt = buildPrompt('projectSummary', { workspaceName: workspaceName || '', fileList, currentFileName: currentFileName || '' });
    const rawResponse = await aiManager.generateResponse(prompt, {});

    let summary = null;
    let parseError = null;
    try {
      const cleaned = rawResponse.replace(/^```(?:json)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      summary = JSON.parse(cleaned);
      if (typeof summary !== 'object' || Array.isArray(summary)) summary = null;
      if (summary) {
        summary.mainFiles = Array.isArray(summary.mainFiles) ? summary.mainFiles.slice(0, 8) : [];
        summary.keyFlows = Array.isArray(summary.keyFlows) ? summary.keyFlows : [];
        summary.risks = Array.isArray(summary.risks) ? summary.risks : [];
        summary.nextSteps = Array.isArray(summary.nextSteps) ? summary.nextSteps : [];
        summary.overview = typeof summary.overview === 'string' ? summary.overview : '';
      }
    } catch (e) {
      parseError = rawResponse;
    }

    res.json({ summary, parseError });
  } catch (err) {
    next(err);
  }
});

// PR Summary – title, summary, key changes, test checklist, risks
app.post("/api/ai/pr-summary", auth, async (req, res, next) => {
  try {
    const { changedFiles, diffSummary, branchName, workspaceName } = req.body;
    if (!changedFiles || !Array.isArray(changedFiles)) {
      return res.status(400).json({ error: "Missing changedFiles array" });
    }

    const prompt = buildPrompt('prSummary', { changedFiles, diffSummary: diffSummary || '', branchName: branchName || '', workspaceName: workspaceName || '' });
    const rawResponse = await aiManager.generateResponse(prompt, {});

    let result = null;
    let parseError = null;
    try {
      const cleaned = rawResponse.replace(/^```(?:json)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      result = JSON.parse(cleaned);
      if (typeof result !== 'object' || Array.isArray(result)) result = null;
      if (result) {
        result.title = typeof result.title === 'string' ? result.title : '';
        result.summary = typeof result.summary === 'string' ? result.summary : '';
        result.keyChanges = Array.isArray(result.keyChanges) ? result.keyChanges : [];
        result.testingChecklist = Array.isArray(result.testingChecklist) ? result.testingChecklist : [];
        result.risksAndNotes = Array.isArray(result.risksAndNotes) ? result.risksAndNotes : [];
      }
    } catch (e) {
      parseError = rawResponse;
    }

    res.json({ result, parseError });
  } catch (err) {
    next(err);
  }
});

// Release Notes – summary, features, fixes, improvements, known issues, upgrade notes
app.post("/api/ai/release-notes", auth, async (req, res, next) => {
  try {
    const { commitMessages, diffSummary, version, workspaceName } = req.body;

    const prompt = buildPrompt('releaseNotes', {
      commitMessages: commitMessages || [],
      diffSummary: diffSummary || '',
      version: version || '',
      workspaceName: workspaceName || ''
    });
    const rawResponse = await aiManager.generateResponse(prompt, {});

    let result = null;
    let parseError = null;
    try {
      const cleaned = rawResponse.replace(/^```(?:json)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      result = JSON.parse(cleaned);
      if (typeof result !== 'object' || Array.isArray(result)) result = null;
      if (result) {
        result.releaseSummary = typeof result.releaseSummary === 'string' ? result.releaseSummary : '';
        result.features = Array.isArray(result.features) ? result.features : [];
        result.fixes = Array.isArray(result.fixes) ? result.fixes : [];
        result.improvements = Array.isArray(result.improvements) ? result.improvements : [];
        result.knownIssues = Array.isArray(result.knownIssues) ? result.knownIssues : [];
        result.upgradeNotes = Array.isArray(result.upgradeNotes) ? result.upgradeNotes : [];
      }
    } catch (e) {
      parseError = rawResponse;
    }

    res.json({ result, parseError });
  } catch (err) {
    next(err);
  }
});

// Repo Health Review – score, arch concerns, maintainability, testing, consistency, recommendations
app.post("/api/ai/repo-health", auth, async (req, res, next) => {
  try {
    const { workspaceName, fileList, projectSummary, commitMessages } = req.body;
    if (!fileList || !Array.isArray(fileList)) {
      return res.status(400).json({ error: "Missing fileList array" });
    }

    const prompt = buildPrompt('repoHealth', {
      workspaceName: workspaceName || '',
      fileList,
      projectSummary: projectSummary || '',
      commitMessages: commitMessages || []
    });
    const rawResponse = await aiManager.generateResponse(prompt, {});

    let result = null;
    let parseError = null;
    try {
      const cleaned = rawResponse.replace(/^```(?:json)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      result = JSON.parse(cleaned);
      if (typeof result !== 'object' || Array.isArray(result)) result = null;
      if (result) {
        result.healthScore = typeof result.healthScore === 'number' ? Math.min(10, Math.max(1, result.healthScore)) : 5;
        result.healthLabel = typeof result.healthLabel === 'string' ? result.healthLabel : 'Fair';
        result.architectureConcerns = Array.isArray(result.architectureConcerns) ? result.architectureConcerns : [];
        result.maintainabilityRisks = Array.isArray(result.maintainabilityRisks) ? result.maintainabilityRisks : [];
        result.testingGaps = Array.isArray(result.testingGaps) ? result.testingGaps : [];
        result.consistencyIssues = Array.isArray(result.consistencyIssues) ? result.consistencyIssues : [];
        result.topRecommendations = Array.isArray(result.topRecommendations) ? result.topRecommendations.slice(0, 5) : [];
      }
    } catch (e) {
      parseError = rawResponse;
    }

    res.json({ result, parseError });
  } catch (err) {
    next(err);
  }
});

// --- Git APIs ---




// Git Status
app.get("/api/workspaces/:id/git/status", auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const files = await prisma.projectFile.findMany({ where: { workspaceId: id } });
    const status = await runGitCommand(id, files, 'git status --porcelain');
    res.json({ status });
  } catch (err) {
    next(err);
  }
});

// Git Diff
app.get("/api/workspaces/:id/git/diff/:fileName", auth, async (req, res, next) => {
  try {
    const { id, fileName } = req.params;
    const files = await prisma.projectFile.findMany({ where: { workspaceId: id } });
    const diff = await runGitCommand(id, files, `git diff ${fileName}`);
    res.json({ diff });
  } catch (err) {
    next(err);
  }
});

// Git Add
app.post("/api/workspaces/:id/git/add", auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { files: filesToAdd } = req.body;
    const files = await prisma.projectFile.findMany({ where: { workspaceId: id } });
    await runGitCommand(id, files, `git add ${filesToAdd.join(' ')}`);
    res.json({ message: "Files added" });
  } catch (err) {
    next(err);
  }
});

// Git Commit
app.post("/api/workspaces/:id/git/commit", auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const files = await prisma.projectFile.findMany({ where: { workspaceId: id } });
    await runGitCommand(id, files, `git commit -m "${message}"`);
    res.json({ message: "Commit successful" });
  } catch (err) {
    next(err);
  }
});

// Git Log
app.get("/api/workspaces/:id/git/log", auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const files = await prisma.projectFile.findMany({ where: { workspaceId: id } });
    const log = await runGitCommand(id, files, 'git log --pretty=format:"%h - %an, %ar : %s"');
    res.json({ log });
  } catch (err) {
    next(err);
    if (err instanceof ZodError) return fail(res, err.errors[0]?.message || "Invalid input");
    console.error("[Login]", err.message);
    return fail(res, "Login failed. Please try again.", 500);
  }
});

// ME
app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, email, display_name AS \"displayName\", created_at AS \"createdAt\" FROM users WHERE id = $1",
      [req.user.sub]
    );
    if (!rows[0]) return fail(res, "User not found", 404);
    return ok(res, rows[0]);
  } catch (err) {
    return fail(res, "Could not fetch user", 500);
  }
});

// LIST USERS (for invite lookup)
app.get("/api/users", auth, async (req, res) => {
  try {
    const { q } = req.query;
    let query = `SELECT id, email, display_name AS "displayName", created_at AS "createdAt" FROM users`;
    const params = [];
    if (q && String(q).length >= 2) {
      query += ` WHERE email ILIKE $1 OR display_name ILIKE $1`;
      params.push(`%${String(q)}%`);
    }
    query += ` ORDER BY email LIMIT 20`;
    const { rows } = await pool.query(query, params);
    return ok(res, rows);
  } catch (err) {
    return fail(res, "Could not fetch users", 500);
  }
});

// ─────────────────────────────────────────────
// Invite: accept pending invitations when user registers
// ─────────────────────────────────────────────
async function _acceptPendingInvitations(email, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM invitations
     WHERE invited_email = $1
       AND status = 'pending'
       AND expires_at > now()`,
    [email]
  );
  for (const inv of rows) {
    await pool.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [inv.room_id, userId, inv.role]
    );
    await pool.query(
      `UPDATE invitations SET status = 'accepted' WHERE id = $1`,
      [inv.id]
    );
  }
  return rows.length;
}

// ─────────────────────────────────────────────
// Workspace Routes
// ─────────────────────────────────────────────

// GET /api/workspaces — list all workspaces for the current user
app.get("/api/workspaces", auth, async (req, res) => {
  try {
    const { rows: rooms } = await pool.query(
      `SELECT r.id, r.name,
              r.owner_id   AS "ownerId",
              r.created_at AS "createdAt",
              r.updated_at AS "updatedAt"
       FROM rooms r
       JOIN room_members m ON m.room_id = r.id
       WHERE m.user_id = $1
       ORDER BY r.updated_at DESC`,
      [req.user.sub]
    );

    const workspaces = await Promise.all(
      rooms.map(async (r) => ({ ...r, members: await getRoomMembers(r.id) }))
    );
    return ok(res, workspaces);
  } catch (err) {
    console.error("[List workspaces]", err.message);
    return fail(res, "Failed to fetch workspaces", 500);
  }
});

// POST /api/workspaces — create a workspace
app.post("/api/workspaces", auth, async (req, res) => {
  try {
    const { name } = createWorkspaceSchema.parse(req.body);
    const userId = req.user.sub;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO rooms (name, owner_id)
         VALUES ($1, $2)
         RETURNING id, name, owner_id AS "ownerId", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [name, userId]
      );
      const room = rows[0];
      await client.query(
        `INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
        [room.id, userId]
      );
      await client.query("COMMIT");
      const members = await getRoomMembers(room.id);
      return ok(res, { ...room, members }, 201);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err instanceof ZodError) return fail(res, err.errors[0]?.message || "Invalid input");
    console.error("[Create workspace]", err.message);
    return fail(res, "Failed to create workspace", 500);
  }
});

// POST /api/workspaces/join — join by workspace ID
// IMPORTANT: must be before /:id routes
app.post("/api/workspaces/join", auth, async (req, res) => {
  try {
    const workspaceId = req.body?.workspaceId;
    if (!workspaceId) return fail(res, "workspaceId is required");

    // Basic UUID check before DB hit
    if (!/^[0-9a-fA-F-]{36}$/.test(workspaceId)) {
      return fail(res, "Invalid workspace ID format");
    }

    const { rows: roomRows } = await pool.query("SELECT id, name FROM rooms WHERE id = $1", [workspaceId]);
    if (!roomRows[0]) return fail(res, "Workspace not found", 404);

    const existing = await checkMembership(workspaceId, req.user.sub);
    if (existing) {
      return ok(res, { message: "Already a member of this workspace", workspaceId });
    }

    await pool.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, 'VIEWER')
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [workspaceId, req.user.sub]
    );
    return ok(res, { message: `Joined workspace "${roomRows[0].name}"`, workspaceId });
  } catch (err) {
    console.error("[Join workspace]", err.message);
    return fail(res, "Failed to join workspace", 500);
  }
});

// GET /api/workspaces/:id — get a single workspace
app.get("/api/workspaces/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, "Invalid workspace ID");

    const member = await checkMembership(id, req.user.sub);
    if (!member) return fail(res, "Workspace not found or you don't have access", 404);

    const { rows } = await pool.query(
      `SELECT id, name, owner_id AS "ownerId", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM rooms WHERE id = $1`,
      [id]
    );
    if (!rows[0]) return fail(res, "Workspace not found", 404);

    const members = await getRoomMembers(id);
    const pendingInvites = await getPendingInvites(id);
    return ok(res, { ...rows[0], members, pendingInvites });
  } catch (err) {
    console.error("[Get workspace]", err.message);
    return fail(res, "Failed to fetch workspace", 500);
  }
});

// PATCH /api/workspaces/:id — rename workspace
app.patch("/api/workspaces/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, "Invalid workspace ID");

    const { name } = z.object({ name: z.string().min(1).max(200) }).parse(req.body);
    const member = await checkMembership(id, req.user.sub);
    if (!member) return fail(res, "Workspace not found", 404);
    if (!["OWNER", "ADMIN"].includes(member.role)) {
      return fail(res, "Only the owner or admin can rename this workspace", 403);
    }

    const { rows } = await pool.query(
      `UPDATE rooms SET name = $1, updated_at = now() WHERE id = $2
       RETURNING id, name, owner_id AS "ownerId", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [name, id]
    );
    if (!rows[0]) return fail(res, "Workspace not found", 404);

    const members = await getRoomMembers(id);
    return ok(res, { ...rows[0], members });
  } catch (err) {
    if (err instanceof ZodError) return fail(res, err.errors[0]?.message || "Invalid input");
    console.error("[Rename workspace]", err.message);
    return fail(res, "Failed to rename workspace", 500);
  }
});

// DELETE /api/workspaces/:id — delete workspace (owner only)
app.delete("/api/workspaces/:id", auth, async (req, res) => {
  try {
    if (DEMO_AUTH) {
      return res.json({ id: req.user.sub, email: req.user.email, createdAt: new Date().toISOString() });
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, email: true, createdAt: true },
    });
    res.json(user);
    const { id } = req.params;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, "Invalid workspace ID");

    const member = await checkMembership(id, req.user.sub);
    if (!member) return fail(res, "Workspace not found", 404);
    if (member.role !== "OWNER") return fail(res, "Only the owner can delete this workspace", 403);

    // Cascade: files → room (room_members cascade auto-deleted)
    await pool.query("DELETE FROM file_versions fv USING project_files pf WHERE fv.file_id = pf.id AND pf.room_id = $1", [id]);
    await pool.query("DELETE FROM project_files WHERE room_id = $1", [id]);
    await pool.query("DELETE FROM invitations WHERE room_id = $1", [id]);
    await pool.query("DELETE FROM rooms WHERE id = $1", [id]);

    return ok(res, { message: "Workspace deleted successfully" });
  } catch (err) {
    console.error("[Delete workspace]", err.message);
    return fail(res, "Failed to delete workspace", 500);
  }
});

// ─────────────────────────────────────────────
// Invite Routes
// ─────────────────────────────────────────────

async function getPendingInvites(roomId) {
  const { rows } = await pool.query(
    `SELECT i.id, i.invited_email AS "invitedEmail", i.role, i.status,
            i.created_at AS "createdAt", i.expires_at AS "expiresAt",
            json_build_object('id', u.id, 'email', u.email) AS "invitedBy"
     FROM invitations i
     JOIN users u ON u.id = i.invited_by
     WHERE i.room_id = $1
       AND i.status = 'pending'
       AND i.expires_at > now()
     ORDER BY i.created_at DESC`,
    [roomId]
  );
  return rows;
}

// POST /api/workspaces/:id/invite — invite by email
app.post("/api/workspaces/:id/invite", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, "Invalid workspace ID");

    const { email, role } = inviteSchema.parse(req.body);
    const inviterId = req.user.sub;

    // Check workspace exists
    const { rows: roomRows } = await pool.query("SELECT id, name FROM rooms WHERE id = $1", [id]);
    if (!roomRows[0]) return fail(res, "Workspace not found", 404);

    // Check inviter has permission
    const inviter = await checkMembership(id, inviterId);
    if (!inviter) return fail(res, "You are not a member of this workspace", 403);
    if (!["OWNER", "ADMIN"].includes(inviter.role)) {
      return fail(res, "Only owners and admins can send invitations", 403);
    }

    const emailNorm = email.trim().toLowerCase();
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8080";

if (DEMO_AUTH) {
  app.post("/api/workspaces", auth, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const id = demoId("ws");
    const now = new Date().toISOString();
    const ws = { id, name, ownerId: req.user.sub, createdAt: now, updatedAt: now };
    demoStore.workspaces.set(id, ws);
    const key = `${id}:${req.user.sub}`;
    demoStore.members.set(key, { id: demoId("m"), workspaceId: id, userId: req.user.sub, role: "OWNER", user: { id: req.user.sub, email: req.user.email } });
    demoStore.activities.set(id, []);
    return res.json({ ...ws, members: [demoStore.members.get(key)] });
  });
  app.get("/api/workspaces", auth, async (req, res) => {
    const arr = [];
    for (const [id, ws] of demoStore.workspaces.entries()) {
      const has = demoStore.members.get(`${id}:${req.user.sub}`);
      if (has) {
        const members = [];
        for (const v of demoStore.members.values()) if (v.workspaceId === id) members.push(v);
        arr.push({ ...ws, owner: { id: ws.ownerId, email: req.user.email }, members });
      }
    }
    arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return res.json(arr);
  });
  app.post("/api/workspaces/:id/invite", auth, async (req, res) => {
    const { id } = req.params;
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    const ws = demoStore.workspaces.get(id);
    if (!ws) return res.status(404).json({ error: "Workspace not found" });
    const requester = demoStore.members.get(`${id}:${req.user.sub}`);
    if (!requester || requester.role !== 'OWNER') return res.status(403).json({ error: "Only owners can invite members" });
    const invitedId = `demo_${Buffer.from(email).toString("hex").slice(0, 16)}`;
    const exists = demoStore.members.get(`${id}:${invitedId}`);
    if (exists) return res.status(409).json({ error: "User is already a member" });
    demoStore.members.set(`${id}:${invitedId}`, { id: demoId("m"), workspaceId: id, userId: invitedId, role: "EDITOR", user: { id: invitedId, email } });
    const host = req.get('host') || 'localhost:8081';
    const inviteLink = `${req.protocol}://${host}/workspace/${id}`;
    return res.json({ message: "User added to workspace", link: inviteLink });
  });
  app.get("/api/workspaces/:id", auth, async (req, res) => {
    const { id } = req.params;
    const ws = demoStore.workspaces.get(id);
    if (!ws) return res.status(404).json({ error: "Workspace not found" });
    const isMember = !!demoStore.members.get(`${id}:${req.user.sub}`);
    if (!isMember) return res.status(403).json({ error: "Access denied" });
    const members = [];
    for (const v of demoStore.members.values()) if (v.workspaceId === id) members.push(v);
    return res.json({ ...ws, owner: { id: ws.ownerId, email: req.user.email }, members });
  });
  app.get("/api/workspaces/:id/members", auth, async (req, res) => {
    const { id } = req.params;
    const me = demoStore.members.get(`${id}:${req.user.sub}`);
    if (!me) return res.status(403).json({ error: "Access denied" });
    const members = [];
    for (const v of demoStore.members.values()) if (v.workspaceId === id) members.push(v);
    return res.json(members);
  });
  app.patch("/api/workspaces/:id/members/:userId", auth, async (req, res) => {
    const { id, userId } = req.params;
    const { role } = req.body;
    if (!['OWNER', 'ADMIN', 'MEMBER', 'EDITOR', 'VIEWER'].includes(role)) return res.status(400).json({ error: "Invalid role" });
    const requester = demoStore.members.get(`${id}:${req.user.sub}`);
    if (!requester || requester.role !== 'OWNER') return res.status(403).json({ error: "Only owners can change roles" });
    const targetKey = `${id}:${userId}`;
    const target = demoStore.members.get(targetKey);
    if (!target) return res.status(404).json({ error: "Member not found" });
    demoStore.members.set(targetKey, { ...target, role });
    return res.json(demoStore.members.get(targetKey));
  });
  app.delete("/api/workspaces/:id/members/:userId", auth, async (req, res) => {
    const { id, userId } = req.params;
    const requester = demoStore.members.get(`${id}:${req.user.sub}`);
    if (!requester || requester.role !== 'OWNER') return res.status(403).json({ error: "Only owners can remove members" });
    if (userId === req.user.sub) return res.status(400).json({ error: "Cannot remove yourself. Leave the workspace instead." });
    const targetKey = `${id}:${userId}`;
    if (!demoStore.members.has(targetKey)) return res.status(404).json({ error: "Member not found" });
    demoStore.members.delete(targetKey);
    return res.json({ message: "Member removed" });
  });
  app.delete("/api/workspaces/:id", auth, async (req, res) => {
    const { id } = req.params;
    const requester = demoStore.members.get(`${id}:${req.user.sub}`);
    if (!requester || requester.role !== 'OWNER') return res.status(403).json({ error: "Only owners can delete workspaces" });
    demoStore.workspaces.delete(id);
    for (const k of Array.from(demoStore.members.keys())) if (k.startsWith(id + ":")) demoStore.members.delete(k);
    for (const [fid, f] of Array.from(demoStore.files.entries())) if (f.workspaceId === id) demoStore.files.delete(fid);
    demoStore.activities.delete(id);
    return res.json({ message: "Workspace deleted" });
  });
  app.get("/api/workspaces/:id/files", auth, async (req, res) => {
    const { id } = req.params;
    const me = demoStore.members.get(`${id}:${req.user.sub}`);
    if (!me) return res.status(403).json({ error: "Access denied" });
    const files = [];
    for (const f of demoStore.files.values()) if (f.workspaceId === id) files.push({ id: f.id, name: f.name, language: f.language, updatedAt: f.updatedAt });
    files.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return res.json(files);
  });
  app.post("/api/workspaces/:id/files", auth, async (req, res) => {
    const { id } = req.params;
    const { name, content, language } = req.body;
    if (!name) return res.status(400).json({ error: "Filename is required" });
    const me = demoStore.members.get(`${id}:${req.user.sub}`);
    if (!me || ['VIEWER'].includes(me.role)) return res.status(403).json({ error: "Write access denied" });
    const fileId = demoId("file");
    const f = { id: fileId, workspaceId: id, name, content: content || "", language: language || "plaintext", updatedAt: new Date().toISOString() };
    demoStore.files.set(fileId, f);
    const acts = demoStore.activities.get(id) || [];
    acts.push({ id: demoId("act"), workspaceId: id, userId: req.user.sub, actionType: "FILE_CREATED", metadata: { fileName: name, fileId }, createdAt: new Date().toISOString() });
    demoStore.activities.set(id, acts);
    return res.json(f);
  });
  app.get("/api/files/:id", auth, async (req, res) => {
    const { id } = req.params;
    const f = demoStore.files.get(id);
    if (!f) return res.status(404).json({ error: "File not found" });
    const me = demoStore.members.get(`${f.workspaceId}:${req.user.sub}`);
    if (!me) return res.status(403).json({ error: "Access denied" });
    return res.json(f);
  });
  app.put("/api/files/:id", auth, async (req, res) => {
    const { id } = req.params;
    const { content, name, language } = req.body;
    const f = demoStore.files.get(id);
    if (!f) return res.status(404).json({ error: "File not found" });
    const me = demoStore.members.get(`${f.workspaceId}:${req.user.sub}`);
    if (!me || ['VIEWER'].includes(me.role)) return res.status(403).json({ error: "Write access denied" });
    const updated = { ...f, content: content !== undefined ? content : f.content, name: name !== undefined ? name : f.name, language: language !== undefined ? language : f.language, updatedAt: new Date().toISOString() };
    demoStore.files.set(id, updated);
    const acts = demoStore.activities.get(f.workspaceId) || [];
    const actionType = name !== undefined && name !== f.name ? "FILE_RENAMED" : language !== undefined && language !== f.language ? "FILE_LANGUAGE_CHANGED" : "FILE_UPDATED";
    acts.push({ id: demoId("act"), workspaceId: f.workspaceId, userId: req.user.sub, actionType, metadata: { fileName: updated.name, fileId: id }, createdAt: new Date().toISOString() });
    demoStore.activities.set(f.workspaceId, acts);
    return res.json(updated);
  });
  app.delete("/api/files/:id", auth, async (req, res) => {
    const { id } = req.params;
    const f = demoStore.files.get(id);
    if (!f) return res.status(404).json({ error: "File not found" });
    const me = demoStore.members.get(`${f.workspaceId}:${req.user.sub}`);
    if (!me || !['OWNER', 'ADMIN'].includes(me.role)) return res.status(403).json({ error: "Only admins can delete files" });
    demoStore.files.delete(id);
    const acts = demoStore.activities.get(f.workspaceId) || [];
    acts.push({ id: demoId("act"), workspaceId: f.workspaceId, userId: req.user.sub, actionType: "FILE_DELETED", metadata: { fileName: f.name, fileId: id }, createdAt: new Date().toISOString() });
    demoStore.activities.set(f.workspaceId, acts);
    return res.json({ message: "File deleted" });
  });
  app.get("/api/workspaces/:id/activity", auth, async (req, res) => {
    const { id } = req.params;
    const me = demoStore.members.get(`${id}:${req.user.sub}`);
    if (!me) return res.status(403).json({ error: "Access denied" });
    const activities = demoStore.activities.get(id) || [];
    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return res.json(activities.slice(0, 50));
  });
}

// Create Workspace
app.post("/api/workspaces", auth, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const workspace = await prisma.workspace.create({
      data: {
        name,
        ownerId: req.user.sub,
        members: {
          create: {
            userId: req.user.sub,
            role: "OWNER",
          },
        },
      },
      include: {
        members: true,
    // Case 1: User exists — add them directly to workspace
    const { rows: userRows } = await pool.query(
      "SELECT id, email, display_name FROM users WHERE email = $1",
      [emailNorm]
    );

    if (userRows[0]) {
      const invitee = userRows[0];

      // Check if already a member
      const alreadyMember = await checkMembership(id, invitee.id);
      if (alreadyMember) {
        return fail(res, `${emailNorm} is already a member of this workspace`, 409);
      }

      // Add directly
      await pool.query(
        `INSERT INTO room_members (room_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (room_id, user_id) DO UPDATE SET role = $3`,
        [id, invitee.id, role]
      );

      // Mark any pending invitation as accepted
      await pool.query(
        `UPDATE invitations SET status = 'accepted' WHERE room_id = $1 AND invited_email = $2`,
        [id, emailNorm]
      );

      return ok(res, {
        message: `${invitee.email} has been added to the workspace`,
        invited: { email: invitee.email, displayName: invitee.display_name, role },
        userExists: true,
      });
    }

    // Case 2: User doesn't have an account — create a pending invitation
    // Check if already invited (pending)
    const { rows: existingInvite } = await pool.query(
      `SELECT id, status, expires_at FROM invitations
       WHERE room_id = $1 AND invited_email = $2`,
      [id, emailNorm]
    );

    if (existingInvite[0]) {
      const inv = existingInvite[0];
      if (inv.status === "pending" && new Date(inv.expires_at) > new Date()) {
        return fail(res, `An invitation has already been sent to ${emailNorm}. It's still pending.`, 409);
      }
      // Expired or rejected — delete old and create new
      await pool.query("DELETE FROM invitations WHERE id = $1", [inv.id]);
    }

    const { rows: invRows } = await pool.query(
      `INSERT INTO invitations (room_id, invited_email, invited_by, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, token, invited_email AS "invitedEmail", role, expires_at AS "expiresAt"`,
      [id, emailNorm, inviterId, role]
    );
    const invitation = invRows[0];
    const inviteLink = `${frontendUrl}/invite/${invitation.token}`;

    return ok(res, {
      message: `Invitation sent to ${emailNorm}. They will be added when they register.`,
      invited: { email: emailNorm, role },
      userExists: false,
      inviteLink,
      expiresAt: invitation.expiresAt,
    }, 201);
  } catch (err) {
    if (err instanceof ZodError) return fail(res, err.errors[0]?.message || "Invalid input");
    console.error("[Invite]", err.message);
    return fail(res, "Failed to send invitation. Please try again.", 500);
  }
});

// GET /api/workspaces/:id/invitations — list pending invitations
app.get("/api/workspaces/:id/invitations", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, "Invalid workspace ID");

    const member = await checkMembership(id, req.user.sub);
    if (!member) return fail(res, "Not a member of this workspace", 403);
    if (!["OWNER", "ADMIN"].includes(member.role)) {
      return fail(res, "Only owners and admins can view invitations", 403);
    }

    const invites = await getPendingInvites(id);
    return ok(res, invites);
  } catch (err) {
    return fail(res, "Failed to fetch invitations", 500);
  }
});

// DELETE /api/workspaces/:id/invitations/:inviteId — cancel invitation
app.delete("/api/workspaces/:id/invitations/:inviteId", auth, async (req, res) => {
  try {
    const { id, inviteId } = req.params;
    const member = await checkMembership(id, req.user.sub);
    if (!member || !["OWNER", "ADMIN"].includes(member.role)) {
      return fail(res, "Permission denied", 403);
    }
    await pool.query("DELETE FROM invitations WHERE id = $1 AND room_id = $2", [inviteId, id]);
    return ok(res, { message: "Invitation cancelled" });
  } catch (err) {
    return fail(res, "Failed to cancel invitation", 500);
  }
});

// GET /api/invite/:token — accept invitation via link
app.get("/api/invite/:token", auth, async (req, res) => {
  try {
    const { token } = req.params;
    const { rows } = await pool.query(
      `SELECT i.*, r.name AS "workspaceName"
       FROM invitations i
       JOIN rooms r ON r.id = i.room_id
       WHERE i.token = $1`,
      [token]
    );
    if (!rows[0]) return fail(res, "Invitation not found or already used", 404);

    const inv = rows[0];
    if (inv.status !== "pending") return fail(res, `Invitation has already been ${inv.status}`, 410);
    if (new Date(inv.expires_at) < new Date()) return fail(res, "Invitation has expired", 410);

    // The current user's email must match the invitation email
    const { rows: userRows } = await pool.query("SELECT email FROM users WHERE id = $1", [req.user.sub]);
    if (!userRows[0]) return fail(res, "User not found", 404);

    if (userRows[0].email.toLowerCase() !== inv.invited_email.toLowerCase()) {
      return fail(res, `This invitation was sent to ${inv.invited_email}. Please log in with that account.`, 403);
    }

    // Add to workspace
    await pool.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id) DO UPDATE SET role = $3`,
      [inv.room_id, req.user.sub, inv.role]
    );

    await pool.query("UPDATE invitations SET status = 'accepted' WHERE id = $1", [inv.id]);

    return ok(res, {
      message: `Welcome to "${inv.workspaceName}"!`,
      workspaceId: inv.room_id,
      workspaceName: inv.workspaceName,
    });
  } catch (err) {
    console.error("[Accept invite]", err.message);
    return fail(res, "Failed to accept invitation", 500);
  }
});

// ─────────────────────────────────────────────
// Member Management
// ─────────────────────────────────────────────

// GET /api/workspaces/:id/members
app.get("/api/workspaces/:id/members", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, "Invalid workspace ID");

    const member = await checkMembership(id, req.user.sub);
    if (!member) return fail(res, "Not a member of this workspace", 403);

    const members = await getRoomMembers(id);
    return ok(res, members);
  } catch (err) {
    return fail(res, "Failed to fetch members", 500);
  }
});

// DELETE /api/workspaces/:id/members/:userId — remove member
app.delete("/api/workspaces/:id/members/:userId", auth, async (req, res) => {
  try {
    const { id, userId: targetId } = req.params;
    if (!/^[0-9a-fA-F-]{36}$/.test(id) || !/^[0-9a-fA-F-]{36}$/.test(targetId)) {
      return fail(res, "Invalid ID format");
    }

    const requester = await checkMembership(id, req.user.sub);
    if (!requester) return fail(res, "Workspace not found", 404);

    // Allow self-removal
    const isSelf = req.user.sub === targetId;
    if (!isSelf && !["OWNER", "ADMIN"].includes(requester.role)) {
      return fail(res, "Only owners and admins can remove other members", 403);
    }

    const target = await checkMembership(id, targetId);
    if (!target) return fail(res, "Member not found in this workspace", 404);
    if (target.role === "OWNER" && !isSelf) {
      return fail(res, "Cannot remove the workspace owner", 403);
    }
    if (target.role === "OWNER" && isSelf) {
      return fail(res, "Owners cannot leave their own workspace. Transfer ownership first.", 403);
    }

    await pool.query("DELETE FROM room_members WHERE room_id = $1 AND user_id = $2", [id, targetId]);
    return ok(res, { message: isSelf ? "Left the workspace" : "Member removed successfully" });
  } catch (err) {
    console.error("[Remove member]", err.message);
    return fail(res, "Failed to remove member", 500);
  }
});

// PATCH /api/workspaces/:id/members/:userId — update member role
app.patch("/api/workspaces/:id/members/:userId", auth, async (req, res) => {
  try {
    const { id, userId: targetId } = req.params;
    if (!/^[0-9a-fA-F-]{36}$/.test(id) || !/^[0-9a-fA-F-]{36}$/.test(targetId)) {
      return fail(res, "Invalid ID format");
    }

    const { role } = z.object({ role: z.enum(["ADMIN", "EDITOR", "VIEWER", "VISITOR"]) }).parse(req.body);

    const requester = await checkMembership(id, req.user.sub);
    if (!requester) return fail(res, "Workspace not found", 404);
    if (!["OWNER", "ADMIN"].includes(requester.role)) {
      return fail(res, "Only owners and admins can change member roles", 403);
    }

    const target = await checkMembership(id, targetId);
    if (!target) return fail(res, "Member not found in this workspace", 404);
    if (target.role === "OWNER") return fail(res, "Cannot change the owner's role", 403);

    // Admins cannot promote/demote to ADMIN (only owner can)
    if (requester.role === "ADMIN" && role === "ADMIN") {
      return fail(res, "Admins cannot assign Admin role. Only the owner can.", 403);
    }

    await pool.query(
      "UPDATE room_members SET role = $1 WHERE room_id = $2 AND user_id = $3",
      [role, id, targetId]
    );
    return ok(res, { message: "Role updated successfully", userId: targetId, role });
  } catch (err) {
    if (err instanceof ZodError) return fail(res, `Invalid role. Allowed: ADMIN, EDITOR, VIEWER, VISITOR`);
    console.error("[Update role]", err.message);
    return fail(res, "Failed to update role", 500);
  }
});

// ─────────────────────────────────────────────
// Presence (in-memory)
// ─────────────────────────────────────────────
const activeUsers = new Map();

app.post("/api/workspaces/:id/presence/enter", auth, (req, res) => {
  const { id } = req.params;
  if (!activeUsers.has(id)) activeUsers.set(id, new Set());
  activeUsers.get(id).add(req.user.sub);
  return ok(res, { activeCount: activeUsers.get(id).size });
});

app.post("/api/workspaces/:id/presence/leave", auth, (req, res) => {
  const { id } = req.params;
  activeUsers.get(id)?.delete(req.user.sub);
  return ok(res, { message: "Left presence" });
});

app.get("/api/workspaces/:id/presence", auth, (req, res) => {
  const users = activeUsers.has(req.params.id)
    ? Array.from(activeUsers.get(req.params.id))
    : [];
  return ok(res, { activeUsers: users, count: users.length });
});

// ─────────────────────────────────────────────
// File Routes
// ─────────────────────────────────────────────

// GET /api/workspaces/:id/files
app.get("/api/workspaces/:id/files", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, "Invalid workspace ID");

    const member = await checkMembership(id, req.user.sub);
    if (!member) return fail(res, "Not a member of this workspace", 403);

    const { rows } = await pool.query(
      `SELECT id, name, language, updated_at AS "updatedAt"
       FROM project_files WHERE room_id = $1
       ORDER BY name ASC`,
      [id]
    );
    return ok(res, rows);
  } catch (err) {
    return fail(res, "Failed to fetch files", 500);
  }
});

// POST /api/workspaces/:id/files
app.post("/api/workspaces/:id/files", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, "Invalid workspace ID");

    const { name, content, language } = req.body;
    if (!name?.trim()) return fail(res, "File name is required");

    const member = await checkMembership(id, req.user.sub);
    if (!member) return fail(res, "Not a member of this workspace", 403);
    if (member.role === "VIEWER") return fail(res, "Viewers cannot create files", 403);

    // Check for duplicate name
    const { rows: dup } = await pool.query(
      "SELECT id FROM project_files WHERE room_id = $1 AND name = $2",
      [id, name.trim()]
    );
    if (dup[0]) return fail(res, `A file named "${name}" already exists in this workspace`, 409);

    const { rows } = await pool.query(
      `INSERT INTO project_files (room_id, name, content, language)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, language, content, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [id, name.trim(), content || "", language || "plaintext"]
    );
    return ok(res, rows[0], 201);
  } catch (err) {
    console.error("[Create file]", err.message);
    return fail(res, "Failed to create file", 500);
  }
});

// GET /api/files/:id
app.get("/api/files/:id", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, room_id AS "workspaceId", name, content, language,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM project_files WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return fail(res, "File not found", 404);

    const member = await checkMembership(rows[0].workspaceId, req.user.sub);
    if (!member) return fail(res, "Access denied", 403);

    return ok(res, rows[0]);
  } catch (err) {
    return fail(res, "Failed to fetch file", 500);
  }
});

// PUT /api/files/:id
app.put("/api/files/:id", auth, async (req, res) => {
  try {
    const { rows: fileRows } = await pool.query(
      "SELECT id, room_id AS \"workspaceId\", name, language, content FROM project_files WHERE id = $1",
      [req.params.id]
    );
    if (!fileRows[0]) return fail(res, "File not found", 404);
    const file = fileRows[0];

    const member = await checkMembership(file.workspaceId, req.user.sub);
    if (!member) return fail(res, "Access denied", 403);
    if (member.role === "VIEWER") return fail(res, "Viewers cannot edit files", 403);

    const { content, name, language } = req.body;
    const updates = [];
    const params = [];
    let idx = 1;
    if (content !== undefined) { updates.push(`content = $${idx++}`); params.push(content); }
    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (language !== undefined) { updates.push(`language = $${idx++}`); params.push(language); }

    if (updates.length === 0) return ok(res, file);
    updates.push("updated_at = now()");
    params.push(req.params.id);

    // Save version snapshot before updating if content changed
    if (content !== undefined && content !== file.content) {
      await pool.query(
        "INSERT INTO file_versions (file_id, content, created_by) VALUES ($1, $2, $3)",
        [file.id, file.content, req.user.sub]
      ).catch(() => { });
    }

    const { rows } = await pool.query(
      `UPDATE project_files SET ${updates.join(", ")} WHERE id = $${idx}
       RETURNING id, room_id AS "workspaceId", name, content, language,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      params
    );
    return ok(res, rows[0]);
  } catch (err) {
    console.error("[Update file]", err.message);
    return fail(res, "Failed to update file", 500);
  }
});

// DELETE /api/files/:id
app.delete("/api/files/:id", auth, async (req, res) => {
  try {
    const { rows: fileRows } = await pool.query(
      "SELECT id, room_id AS \"workspaceId\" FROM project_files WHERE id = $1",
      [req.params.id]
    );
    if (!fileRows[0]) return fail(res, "File not found", 404);

    const member = await checkMembership(fileRows[0].workspaceId, req.user.sub);
    if (!member) return fail(res, "Access denied", 403);
    if (!["OWNER", "ADMIN"].includes(member.role)) {
      return fail(res, "Only owners and admins can delete files", 403);
    }

    await pool.query("DELETE FROM file_versions WHERE file_id = $1", [req.params.id]);
    await pool.query("DELETE FROM project_files WHERE id = $1", [req.params.id]);
    return ok(res, { message: "File deleted successfully" });
  } catch (err) {
    return fail(res, "Failed to delete file", 500);
  }
});


// Search in Workspace
app.post("/api/workspaces/:id/search", auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { query } = req.body;

    if (!query) return res.status(400).json({ error: "Query is required" });

    // Check access
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: req.user.sub } }
    });
    if (!member) return res.status(403).json({ error: "Access denied" });

    const files = await prisma.projectFile.findMany({
      where: { workspaceId: id },
      select: { id: true, name: true, content: true }
    });

    const results = [];

    for (const file of files) {
      const lines = file.content.split('\n');
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const column = line.indexOf(query);
        if (column !== -1) {
          matches.push({
            line: i + 1,
            column: column + 1,
            preview: line,
            matchText: query
          });
        }
      }

      if (matches.length > 0) {
        results.push({
          fileId: file.id,
          filePath: file.name,
          fileName: file.name,
          matches
        });
      }
    }

    res.json(results);
  } catch (err) {
    next(err);
  }
});

// --- Versioning APIs ---


// Get File Versions
app.get("/api/files/:id/versions", auth, async (req, res, next) => {
    try {
        const { id } = req.params;
        const file = await prisma.projectFile.findUnique({ where: { id } });
        if (!file) return res.status(404).json({ error: "File not found" });

        // Access check
        const member = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: req.user.sub } }
        });
        if (!member) return res.status(403).json({ error: "Access denied" });

        const versions = await prisma.fileVersion.findMany({
            where: { fileId: id },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                createdAt: true,
                createdBy: true,
                // We exclude content from list for performance
            }
        });

        // Enrich with user info if possible (manually or via relation if we added it, but we didn't add relation to User for createdBy to keep it simple/flexible)
        // For now, return as is. Frontend can show "User ID" or we can fetch users.
        // Let's fetch user emails for createdBy
        const userIds = [...new Set(versions.map(v => v.createdBy).filter(Boolean))];
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true }
        });
        const userMap = Object.fromEntries(users.map(u => [u.id, u.email]));

        const enriched = versions.map(v => ({
            ...v,
            creatorEmail: userMap[v.createdBy] || "Unknown"
        }));

        res.json(enriched);
    } catch (err) {
        next(err);
    }
// ─────────────────────────────────────────────
// File Versions
// ─────────────────────────────────────────────
app.get("/api/files/:id/versions", auth, async (req, res) => {
  try {
    const { rows: fileRows } = await pool.query(
      "SELECT id, room_id AS \"workspaceId\" FROM project_files WHERE id = $1",
      [req.params.id]
    );
    if (!fileRows[0]) return fail(res, "File not found", 404);

    const member = await checkMembership(fileRows[0].workspaceId, req.user.sub);
    if (!member) return fail(res, "Access denied", 403);

    const { rows } = await pool.query(
      `SELECT fv.id, fv.created_at AS "createdAt",
              u.email AS "createdBy"
       FROM file_versions fv
       LEFT JOIN users u ON u.id = fv.created_by
       WHERE fv.file_id = $1
       ORDER BY fv.created_at DESC
       LIMIT 50`,
      [req.params.id]
    );
    return ok(res, rows);
  } catch (err) {
    return fail(res, "Failed to fetch version history", 500);
  }
});

app.get("/api/file-versions/:versionId", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT fv.id, fv.content, fv.created_at AS "createdAt", u.email AS "createdBy"
       FROM file_versions fv
       LEFT JOIN users u ON u.id = fv.created_by
       WHERE fv.id = $1`,
      [req.params.versionId]
    );
    if (!rows[0]) return fail(res, "Version not found", 404);
    return ok(res, rows[0]);
  } catch (err) {
    return fail(res, "Failed to fetch version", 500);
  }
});

app.post("/api/files/:id/restore", auth, async (req, res) => {
  try {
    const { versionId } = req.body;
    if (!versionId) return fail(res, "versionId is required");

    const { rows: fileRows } = await pool.query(
      "SELECT id, room_id AS \"workspaceId\", content FROM project_files WHERE id = $1",
      [req.params.id]
    );
    if (!fileRows[0]) return fail(res, "File not found", 404);

    const member = await checkMembership(fileRows[0].workspaceId, req.user.sub);
    if (!member || member.role === "VIEWER") return fail(res, "Access denied", 403);

    const { rows: vRows } = await pool.query(
      "SELECT content FROM file_versions WHERE id = $1 AND file_id = $2",
      [versionId, req.params.id]
    );
    if (!vRows[0]) return fail(res, "Version not found", 404);

    // Save current state as a new version before restoring
    await pool.query(
      "INSERT INTO file_versions (file_id, content, created_by) VALUES ($1, $2, $3)",
      [req.params.id, fileRows[0].content, req.user.sub]
    );

    const { rows } = await pool.query(
      `UPDATE project_files SET content = $1, updated_at = now() WHERE id = $2
       RETURNING id, room_id AS "workspaceId", name, content, language,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [vRows[0].content, req.params.id]
    );
    return ok(res, { ...rows[0], message: "Version restored successfully" });
  } catch (err) {
    return fail(res, "Failed to restore version", 500);
  }
});

// ─────────────────────────────────────────────
// Activity
// ─────────────────────────────────────────────
app.get("/api/workspaces/:id/activity", auth, async (req, res) => {
  // Return recent file version activity as activity log
  try {
    const { id } = req.params;
    const member = await checkMembership(id, req.user.sub);
    if (!member) return fail(res, "Access denied", 403);

    const { rows } = await pool.query(
      `SELECT fv.id, fv.created_at AS "createdAt",
              json_build_object('email', u.email) AS "user",
              json_build_object('fileName', pf.name) AS "metadata",
              'FILE_UPDATED' AS "actionType"
       FROM file_versions fv
       JOIN project_files pf ON pf.id = fv.file_id
       LEFT JOIN users u ON u.id = fv.created_by
       WHERE pf.room_id = $1
       ORDER BY fv.created_at DESC
       LIMIT 50`,
      [id]
    );
    return ok(res, rows);
  } catch (err) {
    return ok(res, []); // gracefully return empty array on error
  }
});

// Export (stubbed)
app.get("/api/workspaces/:id/export", auth, (req, res) => {
  return fail(res, "Workspace export is not yet implemented", 501);
});

// ─────────────────────────────────────────────
// Code Runner (local)
// ─────────────────────────────────────────────
app.post("/api/run", auth, async (req, res) => {
  try {
    const { fileId, code, language, stdin } = req.body;
    let content = code;
    let lang = language;

    if (fileId) {
      if (DEMO_AUTH) {
        const f = demoStore.files.get(fileId);
        if (!f) return res.status(404).json({ error: "File not found" });
        const me = demoStore.members.get(`${f.workspaceId}:${req.user.sub}`);
        if (!me) return res.status(403).json({ error: "Access denied" });
        content = f.content;
        lang = language || f.language;
        workspaceId = f.workspaceId;
      } else {
        const file = await prisma.projectFile.findUnique({
          where: { id: fileId },
          select: { id: true, content: true, language: true, workspaceId: true },
        });
        if (!file) return res.status(404).json({ error: "File not found" });
        const member = await prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: req.user.sub } }
        });
        if (!member) return res.status(403).json({ error: "Access denied" });
        content = file.content;
        lang = language || file.language;
        workspaceId = file.workspaceId;
      }
      const { rows } = await pool.query(
        "SELECT id, content, language, room_id AS \"workspaceId\" FROM project_files WHERE id = $1",
        [fileId]
      );
      if (!rows[0]) return fail(res, "File not found", 404);
      const m = await checkMembership(rows[0].workspaceId, req.user.sub);
      if (!m) return fail(res, "Access denied", 403);
      content = rows[0].content;
      lang = language || rows[0].language;
    }

    if (!content) return fail(res, "No code to run");

    const normalized = (lang || "").toLowerCase();
    const tmpDir = path.join(__dirname, "runner_tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    let tmpFile, command, args;
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (["javascript", "js", ""].includes(normalized)) {
      tmpFile = path.join(tmpDir, `run_${uid}.js`);
      command = process.execPath;
      args = [tmpFile];
    } else if (normalized === "python" || normalized === "py") {
      tmpFile = path.join(tmpDir, `run_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
      if (process.env.PYTHON_PATH && process.env.PYTHON_PATH.length > 0) {
        command = process.env.PYTHON_PATH;
        args = [tmpFile];
      } else if (process.platform === "win32") {
        // Prefer Windows Python launcher if available
        command = "py";
        args = ["-3", tmpFile];
      } else {
        command = "python";
        args = [tmpFile];
      }
      const rawStdinForPrelude = typeof req.body.stdin === "string" ? req.body.stdin : null;
      const stdinForPrelude = rawStdinForPrelude !== null ? (rawStdinForPrelude.endsWith("\n") ? rawStdinForPrelude : rawStdinForPrelude + "\n") : null;
      if (stdinForPrelude !== null) {
        prelude = `import builtins, io\n_data = ${JSON.stringify(stdinForPrelude)}\n_stream = io.StringIO(_data)\n_bi_input = builtins.input\nbuiltins.input = lambda prompt=None: (print(prompt, end='') if prompt is not None else None) or _stream.readline().rstrip(\"\\n\")\n`;
      }
    } else if (["python", "py"].includes(normalized)) {
      tmpFile = path.join(tmpDir, `run_${uid}.py`);
      command = process.env.PYTHON_PATH || "python3";
      args = [tmpFile];
    } else if (normalized === "go") {
      tmpFile = path.join(tmpDir, `run_${uid}.go`);
      command = "go";
      args = ["run", tmpFile];
    } else {
      return fail(res, `Language "${lang}" is not supported for local execution. Supported: javascript, python, go`);
    }

    fs.writeFileSync(tmpFile, content, "utf8");
    const start = Date.now();
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeoutMs = 5000;
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
    }, timeoutMs);
    // Write stdin if provided (ensure trailing newline for line-based input)
    const rawStdin = typeof req.body.stdin === "string" ? req.body.stdin : null;
    const stdinText = rawStdin !== null ? (rawStdin.endsWith("\n") ? rawStdin : rawStdin + "\n") : null;
    if (stdinText !== null) {
      try {
        child.stdin.write(stdinText);
      } catch {}
    }
    try { child.stdin.end(); } catch {}
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("error", e => {
      clearTimeout(timer);
      try { fs.unlinkSync(tmpFile); } catch {}
      const msg = String(e && e.message ? e.message : e);
      let friendly = msg;
      if (e && e.code === "ENOENT") {
        if (normalized === "python" || normalized === "py") {
          friendly = "Python runtime not found. Install Python or set PYTHON_PATH to python.exe";
        } else if (normalized === "go") {
          friendly = "Go runtime not found. Install Go and ensure 'go' is on PATH";
        } else {
          friendly = `Runtime '${command}' not found. Ensure it is installed and on PATH`;
        }
      }
      res.status(500).json({ error: friendly, stdout: "", stderr: msg, exitCode: -1, durationMs: Date.now() - start, workspaceId });
    });
    child.on("close", code => {

    let stdout = "", stderr = "";
    const timer = setTimeout(() => { try { child.kill(); } catch { } }, 5000);
    if (stdin) { try { child.stdin.write(stdin.endsWith("\n") ? stdin : stdin + "\n"); } catch { } }
    try { child.stdin.end(); } catch { }

    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (code) => {
      clearTimeout(timer);
      try { fs.unlinkSync(tmpFile); } catch { }
      return ok(res, { stdout, stderr, exitCode: code, durationMs: Date.now() - start });
    });
  } catch (err) {
    return fail(res, "Runner error: " + err.message, 500);
  }
});

// ─────────────────────────────────────────────
// Judge0 Proxy
// ─────────────────────────────────────────────
app.post("/api/judge0/run", auth, async (req, res) => {
  try {
    const API_KEY = process.env.RAPIDAPI_KEY;
    if (!API_KEY) return fail(res, "Judge0 API key not configured. Set RAPIDAPI_KEY in backend/.env", 501);

    const { source_code, language_id, stdin, fileId } = req.body || {};
    let code = source_code;
    let langId = language_id;

    if (!code && fileId) {
      const { rows } = await pool.query(
        "SELECT content, language, room_id AS \"workspaceId\" FROM project_files WHERE id = $1",
        [fileId]
      );
      if (!rows[0]) return fail(res, "File not found", 404);
      const m = await checkMembership(rows[0].workspaceId, req.user.sub);
      if (!m) return fail(res, "Access denied", 403);
      code = rows[0].content;
      const map = { Python: 71, JavaScript: 63, TypeScript: 74, "C++": 54, C: 50, Java: 62, Go: 60, Rust: 73 };
      langId = language_id || map[rows[0].language] || 63;
    }

    if (!code || !langId) return fail(res, "source_code and language_id are required");

    const r = await fetch("https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RapidAPI-Key": API_KEY,
        "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
      },
      body: JSON.stringify({ source_code: code, language_id: langId, stdin: stdin || "" }),
    });
    const data = await r.json();
    return ok(res, {
      stdout: data?.stdout || "",
      stderr: data?.stderr || data?.compile_output || "",
      exitCode: data?.status?.id === 3 ? 0 : (data?.exit_code ?? -1),
      durationMs: data?.time ? Math.round(parseFloat(data.time) * 1000) : undefined,
    });
  } catch (err) {
    return fail(res, "Judge0 runner error: " + err.message, 500);
  }
});

// ─────────────────────────────────────────────
// User Invitations (what the logged-in user has received)
// ─────────────────────────────────────────────

// GET /api/invitations — see ALL pending invitations sent to the current user's email
app.get("/api/invitations", auth, async (req, res) => {
  try {
    const { rows: userRows } = await pool.query("SELECT email FROM users WHERE id = $1", [req.user.sub]);
    if (!userRows[0]) return fail(res, "User not found", 404);

    const { rows } = await pool.query(
      `SELECT
         i.id,
         i.room_id       AS "workspaceId",
         i.invited_email AS "invitedEmail",
         i.role,
         i.status,
         i.created_at    AS "createdAt",
         i.expires_at    AS "expiresAt",
         json_build_object('id', r.id, 'name', r.name) AS "workspace",
         json_build_object('id', u.id, 'email', u.email, 'displayName', u.display_name) AS "invitedBy"
       FROM invitations i
       JOIN rooms r ON r.id = i.room_id
       JOIN users u ON u.id = i.invited_by
       WHERE i.invited_email = $1
         AND i.status = 'pending'
         AND i.expires_at > now()
       ORDER BY i.created_at DESC`,
      [userRows[0].email]
    );
    return ok(res, rows);
  } catch (err) {
    console.error("[Get my invitations]", err.message);
    return fail(res, "Failed to fetch invitations", 500);
  }
});

// POST /api/invitations/:id/accept — accept a pending invitation
app.post("/api/invitations/:id/accept", auth, async (req, res) => {
  try {
    const { rows: userRows } = await pool.query("SELECT email FROM users WHERE id = $1", [req.user.sub]);
    if (!userRows[0]) return fail(res, "User not found", 404);

    const { rows: invRows } = await pool.query(
      `SELECT i.*, r.name AS "workspaceName"
       FROM invitations i
       JOIN rooms r ON r.id = i.room_id
       WHERE i.id = $1 AND i.invited_email = $2`,
      [req.params.id, userRows[0].email]
    );
    if (!invRows[0]) return fail(res, "Invitation not found or not addressed to you", 404);

    const inv = invRows[0];
    if (inv.status !== "pending") return fail(res, `Invitation has already been ${inv.status}`, 410);
    if (new Date(inv.expires_at) < new Date()) return fail(res, "Invitation has expired", 410);

    // Check if already member
    const alreadyMember = await checkMembership(inv.room_id, req.user.sub);
    if (alreadyMember) {
      await pool.query("UPDATE invitations SET status = 'accepted' WHERE id = $1", [inv.id]);
      return ok(res, { message: `You are already a member of "${inv.workspaceName}"`, workspaceId: inv.room_id });
    }

    await pool.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id) DO UPDATE SET role = $3`,
      [inv.room_id, req.user.sub, inv.role]
    );
    await pool.query("UPDATE invitations SET status = 'accepted' WHERE id = $1", [inv.id]);

    return ok(res, {
      message: `Welcome to "${inv.workspaceName}"!`,
      workspaceId: inv.room_id,
      workspaceName: inv.workspaceName,
    });
  } catch (err) {
    console.error("[Accept invitation]", err.message);
    return fail(res, "Failed to accept invitation", 500);
  }
});

// POST /api/invitations/:id/reject
app.post("/api/invitations/:id/reject", auth, async (req, res) => {
  try {
    const { rows: userRows } = await pool.query("SELECT email FROM users WHERE id = $1", [req.user.sub]);
    if (!userRows[0]) return fail(res, "User not found", 404);

    const { rows } = await pool.query(
      "UPDATE invitations SET status = 'rejected' WHERE id = $1 AND invited_email = $2 RETURNING id",
      [req.params.id, userRows[0].email]
    );
    if (!rows[0]) return fail(res, "Invitation not found", 404);
    return ok(res, { message: "Invitation rejected" });
  } catch (err) {
    return fail(res, "Failed to reject invitation", 500);
  }
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`API: http://localhost:${PORT}`);
});

// LSP WebSocket Server
const lspWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/lsp') {
    lspWss.handleUpgrade(request, socket, head, (ws) => {
      lspWss.emit('connection', ws, request);
    });
  } else if (pathname === '/terminal') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

lspWss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const workspaceId = url.searchParams.get('workspaceId');
  const token = url.searchParams.get('token');

  if (!workspaceId || !token) {
    ws.close(1008, 'Missing workspaceId or token');
    return;
  }

  try {
    jwt.verify(token, JWT_SECRET);
    const repoDir = path.join(REPOS_DIR, workspaceId);
    
    // Ensure repo directory exists before starting LSP
    if (!fs.existsSync(repoDir)) {
      fs.mkdirSync(repoDir, { recursive: true });
    }

    // Sync files from DB to filesystem to ensure LSP has latest code
    const files = await prisma.projectFile.findMany({ where: { workspaceId } });
    for (const file of files) {
      const filePath = path.join(repoDir, file.name);
      const dirName = path.dirname(filePath);
      if (!fs.existsSync(dirName)) fs.mkdirSync(dirName, { recursive: true });
      fs.writeFileSync(filePath, file.content);
    }

    lspManager.startServer(workspaceId, repoDir, ws);

  } catch (err) {
    console.error('LSP WS Connection Error:', err);
    ws.close(1008, 'Invalid token or internal error');
  }
});

// Terminal WebSocket Server
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const workspaceId = url.searchParams.get('workspaceId');
  const token = url.searchParams.get('token');

  if (!workspaceId || !token) {
    ws.close(1008, 'Missing workspaceId or token');
    return;
  }

  try {
    // Verify token
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = payload.sub;

    // TODO: Verify user is member of workspace
    
    // For now, create a temporary directory for the workspace if it doesn't exist
    const workspaceDir = path.join(process.cwd(), 'workspaces', workspaceId);
    if (!fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
    }

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
        if (msg.type === 'data') {
          session.write(msg.data);
        } else if (msg.type === 'resize') {
          session.resize(msg.cols, msg.rows);
        }
      } catch (err) {
        console.error('Terminal WS Message Error:', err);
      }
    });

    ws.on('close', () => {
      session.removeListener('data', onData);
      session.removeListener('exit', onExit);
      // Optional: Kill session after delay or when no clients left
    });

  } catch (err) {
    console.error('Terminal WS Connection Error:', err);
    ws.close(1008, 'Invalid token');
  }
});

// Keep process alive hack for sandbox
setInterval(() => {}, 10000);
// ─────────────────────────────────────────────
// Join Request System
// ─────────────────────────────────────────────

// POST /api/workspaces/request-access — user requests to join a workspace by ID
// NOTE: must be registered BEFORE the /:id match
app.post("/api/workspaces/request-access", auth, async (req, res) => {
  try {
    const { workspaceId, message } = req.body || {};
    if (!workspaceId) return fail(res, "workspaceId is required");
    if (!/^[0-9a-fA-F-]{36}$/.test(workspaceId)) return fail(res, "Invalid workspace ID format");

    const { rows: roomRows } = await pool.query("SELECT id, name, owner_id FROM rooms WHERE id = $1", [workspaceId]);
    if (!roomRows[0]) return fail(res, "Workspace not found — check the ID and try again", 404);
    const room = roomRows[0];

    // Already a member?
    const alreadyMember = await checkMembership(workspaceId, req.user.sub);
    if (alreadyMember) {
      return ok(res, { message: "You are already a member of this workspace", workspaceId, alreadyMember: true });
    }

    // Already pending request?
    const { rows: existing } = await pool.query(
      "SELECT id, status FROM workspace_join_requests WHERE room_id = $1 AND user_id = $2",
      [workspaceId, req.user.sub]
    );
    if (existing[0]) {
      if (existing[0].status === "pending") {
        return fail(res, "You already have a pending request for this workspace", 409);
      }
      if (existing[0].status === "rejected") {
        return fail(res, "Your previous request was rejected. Contact the workspace owner.", 409);
      }
      // Accepted but not yet a member? Re-insert
      await pool.query("DELETE FROM workspace_join_requests WHERE id = $1", [existing[0].id]);
    }

    await pool.query(
      `INSERT INTO workspace_join_requests (room_id, user_id, message)
       VALUES ($1, $2, $3)`,
      [workspaceId, req.user.sub, message?.trim() || null]
    );

    return ok(res, {
      message: `Access request sent to the owners of "${room.name}". You'll be notified when approved.`,
      workspaceId,
      workspaceName: room.name,
    }, 201);
  } catch (err) {
    console.error("[Request access]", err.message);
    return fail(res, "Failed to send access request", 500);
  }
});

// GET /api/workspaces/:id/requests — owner/admin sees pending join requests
app.get("/api/workspaces/:id/requests", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, "Invalid workspace ID");

    const member = await checkMembership(id, req.user.sub);
    if (!member) return fail(res, "Workspace not found", 404);
    if (!["OWNER", "ADMIN"].includes(member.role)) {
      return fail(res, "Only owners and admins can view join requests", 403);
    }

    const { rows } = await pool.query(
      `SELECT
         jr.id,
         jr.room_id    AS "workspaceId",
         jr.message,
         jr.status,
         jr.created_at AS "createdAt",
         json_build_object(
           'id', u.id,
           'email', u.email,
           'displayName', u.display_name
         ) AS "user"
       FROM workspace_join_requests jr
       JOIN users u ON u.id = jr.user_id
       WHERE jr.room_id = $1 AND jr.status = 'pending'
       ORDER BY jr.created_at DESC`,
      [id]
    );
    return ok(res, rows);
  } catch (err) {
    return fail(res, "Failed to fetch join requests", 500);
  }
});

// POST /api/requests/:id/approve
app.post("/api/requests/:id/approve", auth, async (req, res) => {
  try {
    const { role } = req.body || {};
    const { rows: jrRows } = await pool.query(
      "SELECT * FROM workspace_join_requests WHERE id = $1",
      [req.params.id]
    );
    if (!jrRows[0]) return fail(res, "Request not found", 404);
    const jr = jrRows[0];

    const reviewer = await checkMembership(jr.room_id, req.user.sub);
    if (!reviewer || !["OWNER", "ADMIN"].includes(reviewer.role)) {
      return fail(res, "Permission denied", 403);
    }

    const grantedRole = (role && ["ADMIN", "EDITOR", "VIEWER", "VISITOR"].includes(role)) ? role : "EDITOR";
    await pool.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id) DO UPDATE SET role = $3`,
      [jr.room_id, jr.user_id, grantedRole]
    );
    await pool.query(
      "UPDATE workspace_join_requests SET status = 'approved', reviewed_by = $1, updated_at = now() WHERE id = $2",
      [req.user.sub, req.params.id]
    );

    return ok(res, { message: "Request approved. User added to workspace", userId: jr.user_id, role: grantedRole });
  } catch (err) {
    console.error("[Approve request]", err.message);
    return fail(res, "Failed to approve request", 500);
  }
});

// POST /api/requests/:id/reject
app.post("/api/requests/:id/reject", auth, async (req, res) => {
  try {
    const { rows: jrRows } = await pool.query(
      "SELECT * FROM workspace_join_requests WHERE id = $1",
      [req.params.id]
    );
    if (!jrRows[0]) return fail(res, "Request not found", 404);
    const jr = jrRows[0];

    const reviewer = await checkMembership(jr.room_id, req.user.sub);
    if (!reviewer || !["OWNER", "ADMIN"].includes(reviewer.role)) {
      return fail(res, "Permission denied", 403);
    }

    await pool.query(
      "UPDATE workspace_join_requests SET status = 'rejected', reviewed_by = $1, updated_at = now() WHERE id = $2",
      [req.user.sub, req.params.id]
    );
    return ok(res, { message: "Request rejected" });
  } catch (err) {
    return fail(res, "Failed to reject request", 500);
  }
});

// ─────────────────────────────────────────────
// Visitor Session (2-hour temporary access)
// ─────────────────────────────────────────────

// GET /api/workspaces/:id/session — check session status for current user
app.get("/api/workspaces/:id/session", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT id, role, started_at AS "startedAt", expires_at AS "expiresAt",
              (expires_at > now()) AS active
       FROM workspace_sessions
       WHERE room_id = $1 AND user_id = $2
       ORDER BY started_at DESC LIMIT 1`,
      [id, req.user.sub]
    );
    if (!rows[0]) return ok(res, { hasSession: false });

    const session = rows[0];
    const remainingMs = session.expiresAt ? Math.max(0, new Date(session.expiresAt) - Date.now()) : 0;
    return ok(res, {
      hasSession: true,
      active: session.active,
      role: session.role,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      remainingMs,
      expired: !session.active,
    });
  } catch (err) {
    return fail(res, "Failed to check session", 500);
  }
});

// POST /api/workspaces/:id/session/start — start a 2-hour visitor session
app.post("/api/workspaces/:id/session/start", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return fail(res, "Invalid workspace ID");

    const { rows: roomRows } = await pool.query("SELECT id, name FROM rooms WHERE id = $1", [id]);
    if (!roomRows[0]) return fail(res, "Workspace not found", 404);

    // Check if already a full member (don't create session for members)
    const member = await checkMembership(id, req.user.sub);
    if (member && !["VISITOR"].includes(member.role)) {
      return ok(res, { message: "You are already a member", role: member.role, isFullMember: true });
    }

    // Check if already has an active session today
    const { rows: existing } = await pool.query(
      `SELECT id, expires_at FROM workspace_sessions
       WHERE room_id = $1 AND user_id = $2 AND expires_at > now()`,
      [id, req.user.sub]
    );
    if (existing[0]) {
      const remainingMs = Math.max(0, new Date(existing[0].expires_at) - Date.now());
      return fail(
        res,
        `Your daily access limit has been reached. Try again in ${Math.ceil(remainingMs / 3600000)}h ${Math.ceil((remainingMs % 3600000) / 60000)}m.`,
        429
      );
    }

    // Create or refresh session
    const { rows } = await pool.query(
      `INSERT INTO workspace_sessions (room_id, user_id, role)
       VALUES ($1, $2, 'VISITOR')
       ON CONFLICT (room_id, user_id) DO UPDATE
         SET started_at = now(), expires_at = now() + interval '2 hours', role = 'VISITOR'
       RETURNING id, role, started_at AS "startedAt", expires_at AS "expiresAt"`,
      [id, req.user.sub]
    );

    return ok(res, {
      message: `Visitor access granted to "${roomRows[0].name}" for 2 hours.`,
      session: rows[0],
    }, 201);
  } catch (err) {
    console.error("[Start session]", err.message);
    return fail(res, "Failed to start visitor session", 500);
  }
});


// ─────────────────────────────────────────────

// Global Error Handler
// ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err instanceof ZodError) return fail(res, err.errors[0]?.message || "Invalid input");
  console.error("Unhandled:", err?.stack || err);
  return fail(res, "Internal server error", 500);
});

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

app.listen(PORT, () => {
  console.log(`✅ API running at http://localhost:${PORT}`);
});

setInterval(() => { }, 10_000);

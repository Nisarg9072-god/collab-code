import dotenv from "dotenv";
dotenv.config({ override: true });
import express from "express";
import cors from "cors";
import { PrismaClient, Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z, ZodError } from "zod";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import AdmZip from "adm-zip";
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

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication and user identity
 *   - name: Documents
 *     description: Document lifecycle and access control
 *   - name: History
 *     description: Snapshots and audit logs
 */

const app = express();
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Log queries in dev, error/warn in prod
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

// Test DB connection on startup
prisma.$connect()
  .then(() => console.log("✅ Database connected successfully"))
  .catch((err) => {
    console.error("❌ Database connection failed:", err.message);
  });

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

// SSL fix for Render/Production
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes("sslmode")) {
   console.log("Database SSL mode detected in URL");
}

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

// Middleware
app.use(helmet());
app.use(pinoHttp());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // limit each IP to 120 requests per windowMs
});
app.use(limiter);

// Auth Middleware
const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "missing auth header" });
  
  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid token" });
  }
};

// Schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const createDocSchema = z.object({
  title: z.string().min(1).default("Untitled"),
});

// Health Check Endpoints
app.get("/api/health/db", async (req, res) => {
  console.log("GET /api/health/db - Health check requested");
  try {
    await prisma.$queryRaw`SELECT 1 AS ok`;
    console.log("GET /api/health/db - Success");
    res.json({ backend: "ok", database: "connected" });
  } catch (err) {
    console.error("❌ Database health check failed:", err.message);
    res.status(503).json({ 
      backend: "ok", 
      database: "disconnected", 
      error: err.message 
    });
  }
});

app.get("/api/health/users", async (req, res) => {
  console.log("GET /api/health/users - Users count requested");
  try {
    const count = await prisma.user.count();
    console.log("GET /api/health/users - Success, count:", count);
    res.json({ table: "users", count });
  } catch (err) {
    console.error("❌ Table verification failed:", err.message);
    res.status(500).json({ 
      table: "users", 
      error: err.message 
    });
  }
});

// Routes

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
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: { email, passHash: hashedPassword },
    });
    
    console.log(`[Auth] User registered: ${user.id}`);
    
    // Auto login after register
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
    
    res.status(201).json({ 
      token,
      user: { id: user.id, email: user.email }
    });
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
  }
});

// Login
app.post("/api/auth/login", async (req, res, next) => {
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

    const validPassword = await bcrypt.compare(password, user.passHash);
    if (!validPassword) {
      console.error(`[Auth Error] Invalid password for: ${email}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
    console.log(`[Auth] User logged in: ${user.id}`);
    
    res.json({ 
      token,
      user: { id: user.id, email: user.email }
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
  }
});

// Create Doc
app.post("/docs", auth, async (req, res, next) => {
  try {
    const { title } = createDocSchema.parse(req.body || {});
    const doc = await prisma.doc.create({
      data: {
        title,
        ownerId: req.user.sub,
        members: {
          create: {
            userId: req.user.sub,
            role: "OWNER",
          },
        },
      },
    });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// List Docs
/**
 * @swagger
 * /docs:
 *   get:
 *     tags: [Documents]
 *     summary: List accessible documents
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Document list
 */
app.get("/docs", auth, async (req, res, next) => {
  try {
    const docs = await prisma.doc.findMany({
      where: {
        members: {
          some: { userId: req.user.sub },
        },
      },
      include: {
        members: true,
      },
    });
    res.json(docs);
  } catch (err) {
    next(err);
  }
});

// Get Collab Token
app.post("/docs/:docId/collab-token", auth, async (req, res, next) => {
  try {
    const { docId } = req.params;
    
    // Check membership
    const member = await prisma.docMember.findUnique({
      where: {
        docId_userId: {
          docId,
          userId: req.user.sub,
        },
      },
    });
    
    if (!member) {
      return res.status(403).json({ error: "not a member" });
    }
    
    // Create short-lived collab token
    const collabToken = jwt.sign(
      {
        sub: req.user.sub,
        docId,
        role: member.role,
        typ: "collab", // Explicit type for WS enforcement
      },
      JWT_SECRET,
      { expiresIn: "10m" } // 10 minutes validity
    );
    
    res.json({ token: collabToken });
  } catch (err) {
    next(err);
  }
});

// Restore Snapshot
app.post("/docs/:docId/snapshots/:snapshotId/restore", auth, async (req, res, next) => {
  try {
    const { docId, snapshotId } = req.params;

    const me = await prisma.docMember.findUnique({
      where: { docId_userId: { docId, userId: req.user.sub } },
    });
    if (!me || me.role !== Role.OWNER) return res.status(403).json({ error: "owner only" });

    const snap = await prisma.docSnapshot.findFirst({
      where: { id: snapshotId, docId },
    });
    if (!snap) return res.status(404).json({ error: "snapshot not found" });

    await prisma.docState.upsert({
      where: { docId },
      update: { state: snap.state },
      create: { docId, state: snap.state },
    });

    // Log restore event
    await prisma.docEvent.create({
      data: {
        docId,
        userId: req.user.sub,
        type: "RESTORE",
      },
    });

    res.json({ ok: true, restoredSnapshotId: snapshotId });
  } catch (err) {
    next(err);
  }
});

// List Snapshots
/**
 * @swagger
 * /docs/{docId}/snapshots:
 *   get:
 *     tags: [History]
 *     summary: List document snapshots
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: docId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Snapshot list
 */
app.get("/docs/:docId/snapshots", auth, async (req, res, next) => {
  try {
    const { docId } = req.params;

    const member = await prisma.docMember.findUnique({
      where: { docId_userId: { docId, userId: req.user.sub } },
    });
    if (!member) return res.status(403).json({ error: "not a member" });

    const snaps = await prisma.docSnapshot.findMany({
      where: { docId },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
      take: 50,
    });

    res.json(snaps);
  } catch (err) {
    next(err);
  }
});

// Audit Logs
/**
 * @swagger
 * /docs/{docId}/audit:
 *   get:
 *     tags: [History]
 *     summary: View audit log
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: docId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Audit log
 */
app.get("/docs/:docId/audit", auth, async (req, res, next) => {
  try {
    const { docId } = req.params;

    const member = await prisma.docMember.findUnique({
      where: { docId_userId: { docId, userId: req.user.sub } },
    });
    if (!member) return res.status(403).json({ error: "not a member" });

    const events = await prisma.docEvent.findMany({
      where: { docId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json(events);
  } catch (err) {
    next(err);
  }
});

// Auth Me
/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user info
 */
app.get("/api/auth/me", auth, async (req, res, next) => {
  try {
    if (DEMO_AUTH) {
      return res.json({ id: req.user.sub, email: req.user.email, createdAt: new Date().toISOString() });
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, email: true, createdAt: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

const activeUsers = new Map(); // workspaceId -> Set<userId>

// Presence Endpoints
app.post("/api/workspaces/:id/presence/enter", auth, (req, res) => {
    const { id } = req.params;
    if (!activeUsers.has(id)) {
        activeUsers.set(id, new Set());
    }
    activeUsers.get(id).add(req.user.sub);
    res.json({ success: true, activeCount: activeUsers.get(id).size });
});

app.post("/api/workspaces/:id/presence/leave", auth, (req, res) => {
    const { id } = req.params;
    if (activeUsers.has(id)) {
        activeUsers.get(id).delete(req.user.sub);
    }
    res.json({ success: true });
});

app.get("/api/workspaces/:id/presence", auth, (req, res) => {
    const { id } = req.params;
    const users = activeUsers.has(id) ? Array.from(activeUsers.get(id)) : [];
    res.json({ activeUsers: users });
});

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
      }
    });

    res.json(workspace);
  } catch (err) {
    next(err);
  }
});

// Get User Workspaces
app.get("/api/workspaces", auth, async (req, res, next) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      where: {
        members: {
          some: {
            userId: req.user.sub,
          },
        },
      },
      include: {
        owner: {
          select: { email: true },
        },
        members: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(workspaces);
  } catch (err) {
    next(err);
  }
});

// Invite to Workspace
app.post("/api/workspaces/:id/invite", auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    
    if (!email) return res.status(400).json({ error: "Email is required" });

    // Verify ownership/admin rights
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
            workspaceId: id,
            userId: req.user.sub
        }
      }
    });

    if (!member || member.role !== 'OWNER') {
        return res.status(403).json({ error: "Only owners can invite members" });
    }

    // Find user to invite
    const userToInvite = await prisma.user.findUnique({ where: { email } });
    if (!userToInvite) {
        return res.status(404).json({ error: "User not found" });
    }

    // Check if already a member
    const existingMember = await prisma.workspaceMember.findUnique({
        where: {
            workspaceId_userId: {
                workspaceId: id,
                userId: userToInvite.id
            }
        }
    });

    if (existingMember) {
        return res.status(409).json({ error: "User is already a member" });
    }

    // Create membership
    await prisma.workspaceMember.create({
        data: {
            workspaceId: id,
            userId: userToInvite.id,
            role: "EDITOR"
        }
    });

    const host = req.get('host') || 'localhost:5000';
    const frontendHost = host.replace('5000', '8080');
    const inviteLink = `${req.protocol}://${frontendHost}/workspace/${id}`;

    res.json({ message: "User added to workspace", link: inviteLink });

  } catch (err) {
    next(err);
  }
});

// Get Workspace Details
app.get("/api/workspaces/:id", auth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, email: true } },
        members: {
          include: {
            user: { select: { id: true, email: true } }
          }
        }
      }
    });

    if (!workspace) return res.status(404).json({ error: "Workspace not found" });

    // Check access
    const isMember = workspace.members.some(m => m.userId === req.user.sub);
    if (!isMember) return res.status(403).json({ error: "Access denied" });

    res.json(workspace);
  } catch (err) {
    next(err);
  }
});

// Get Workspace Members
app.get("/api/workspaces/:id/members", auth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check access first
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: req.user.sub } }
    });
    if (!member) return res.status(403).json({ error: "Access denied" });

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: id },
      include: {
        user: { select: { id: true, email: true, createdAt: true } }
      }
    });

    res.json(members);
  } catch (err) {
    next(err);
  }
});

// Update Member Role
app.patch("/api/workspaces/:id/members/:userId", auth, async (req, res, next) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;

    if (!['OWNER', 'ADMIN', 'MEMBER'].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
    }

    // Verify requester is OWNER
    const requester = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: req.user.sub } }
    });

    if (!requester || requester.role !== 'OWNER') {
        return res.status(403).json({ error: "Only owners can change roles" });
    }

    // Prevent removing the last owner (if demoting)
    if (role !== 'OWNER') {
        const targetMember = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId: id, userId } }
        });
        if (targetMember?.role === 'OWNER') {
             const ownerCount = await prisma.workspaceMember.count({
                where: { workspaceId: id, role: 'OWNER' }
            });
            if (ownerCount <= 1) {
                return res.status(400).json({ error: "Cannot demote the last owner" });
            }
        }
    }

    const updated = await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: id, userId } },
      data: { role },
      include: { user: { select: { id: true, email: true } } }
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Remove Member
app.delete("/api/workspaces/:id/members/:userId", auth, async (req, res, next) => {
  try {
    const { id, userId } = req.params;

    // Verify requester is OWNER
    const requester = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: req.user.sub } }
    });

    if (!requester || requester.role !== 'OWNER') {
        return res.status(403).json({ error: "Only owners can remove members" });
    }

    // Cannot remove self (must leave or delete workspace)
    if (userId === req.user.sub) {
        return res.status(400).json({ error: "Cannot remove yourself. Leave the workspace instead." });
    }

    await prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId: id, userId } }
    });

    res.json({ message: "Member removed" });
  } catch (err) {
    next(err);
  }
});

// Delete Workspace
app.delete("/api/workspaces/:id", auth, async (req, res, next) => {
    try {
        const { id } = req.params;
        
        // Verify ownership
        const requester = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId: id, userId: req.user.sub } }
        });

        if (!requester || requester.role !== 'OWNER') {
            return res.status(403).json({ error: "Only owners can delete workspaces" });
        }

        await prisma.workspace.delete({ where: { id } });
        res.json({ message: "Workspace deleted" });
    } catch (err) {
        next(err);
    }
});

// Join Workspace (by ID or Link logic - mostly ID here)
app.post("/api/workspaces/join", auth, async (req, res, next) => {
    try {
        const { workspaceId } = req.body;
        if (!workspaceId) return res.status(400).json({ error: "Workspace ID is required" });

        // Check if workspace exists
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) return res.status(404).json({ error: "Workspace not found" });

        // Check if already member
        const existing = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: req.user.sub } }
        });

        if (existing) return res.json({ message: "Already a member", workspaceId });

        // Add as MEMBER
        await prisma.workspaceMember.create({
            data: {
                workspaceId,
                userId: req.user.sub,
                role: "MEMBER"
            }
        });

        res.json({ message: "Joined workspace", workspaceId });
    } catch (err) {
        next(err);
    }
});





// --- File APIs ---

// List Files
app.get("/api/workspaces/:id/files", auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    // Check access
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: req.user.sub } }
    });
    if (!member) return res.status(403).json({ error: "Access denied" });

    const files = await prisma.projectFile.findMany({
      where: { workspaceId: id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, language: true, updatedAt: true }
    });
    res.json(files);
  } catch (err) {
    next(err);
  }
});

// Create File
app.post("/api/workspaces/:id/files", auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, content, language } = req.body;

    if (!name) return res.status(400).json({ error: "Filename is required" });

    // Check access (Editor+)
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: req.user.sub } }
    });
    if (!member || ['VIEWER'].includes(member.role)) {
      return res.status(403).json({ error: "Write access denied" });
    }

    const file = await prisma.projectFile.create({
      data: {
        workspaceId: id,
        name,
        content: content || "",
        language: language || "plaintext"
      }
    });

    // Log Activity
    await prisma.workspaceActivity.create({
      data: {
        workspaceId: id,
        userId: req.user.sub,
        actionType: "FILE_CREATED",
        metadata: { fileName: name, fileId: file.id }
      }
    });

    res.json(file);
  } catch (err) {
    next(err);
  }
});

// Get File Content
app.get("/api/files/:id", auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const file = await prisma.projectFile.findUnique({
      where: { id },
      include: { workspace: true }
    });
    if (!file) return res.status(404).json({ error: "File not found" });

    // Check access via workspace
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: req.user.sub } }
    });
    if (!member) return res.status(403).json({ error: "Access denied" });

    res.json(file);
  } catch (err) {
    next(err);
  }
});

// Update File (Create Version + Activity)
app.put("/api/files/:id", auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content, name, language } = req.body;

    const file = await prisma.projectFile.findUnique({ where: { id } });
    if (!file) return res.status(404).json({ error: "File not found" });

    // Check access
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: req.user.sub } }
    });
    if (!member || ['VIEWER'].includes(member.role)) {
      return res.status(403).json({ error: "Write access denied" });
    }

    // Create Version if content changed
    if (content !== undefined && content !== file.content) {
        await prisma.fileVersion.create({
            data: {
                fileId: id,
                content: file.content, // Save PREVIOUS content as version
                createdBy: req.user.sub
            }
        });
    }

    const updated = await prisma.projectFile.update({
      where: { id },
      data: {
        content: content !== undefined ? content : undefined,
        name: name !== undefined ? name : undefined,
        language: language !== undefined ? language : undefined,
      }
    });

    // Log Activity (Debounce logic handled by frontend, but we log meaningful updates here)
    // To avoid spam, we might want to skip logging every keystroke save, but since this API is likely called on save/autosave, 
    // we can log. For now, let's log "FILE_UPDATED".
    // Optionally, only log if it's been a while? No, let's keep it simple for now.
    // Actually, spamming activity log is bad. 
    // Let's only log if name changed OR if it's an explicit save (we don't distinguish yet).
    // We will log "FILE_UPDATED" but maybe we can limit it in frontend display.
    
    if (name !== undefined && name !== file.name) {
        await prisma.workspaceActivity.create({
            data: {
                workspaceId: file.workspaceId,
                userId: req.user.sub,
                actionType: "FILE_RENAMED",
                metadata: { oldName: file.name, newName: name, fileId: id }
            }
        });
    } else if (language !== undefined && language !== file.language) {
         await prisma.workspaceActivity.create({
            data: {
                workspaceId: file.workspaceId,
                userId: req.user.sub,
                actionType: "FILE_LANGUAGE_CHANGED",
                metadata: { fileName: file.name, fileId: id, oldLanguage: file.language, newLanguage: language }
            }
        });
    } else if (content !== undefined) {
         // Maybe don't log every content update to activity log to keep it clean?
         // User prompt says: "A edited index.ts".
         // Let's log it.
         await prisma.workspaceActivity.create({
            data: {
                workspaceId: file.workspaceId,
                userId: req.user.sub,
                actionType: "FILE_UPDATED",
                metadata: { fileName: file.name, fileId: id }
            }
        });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Delete File
app.delete("/api/files/:id", auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const file = await prisma.projectFile.findUnique({ where: { id } });
    if (!file) return res.status(404).json({ error: "File not found" });

    // Check access (Owner/Admin only)
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: req.user.sub } }
    });
    
    if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
        return res.status(403).json({ error: "Only admins can delete files" });
    }

    await prisma.projectFile.delete({ where: { id } });

    // Log Activity
    await prisma.workspaceActivity.create({
        data: {
            workspaceId: file.workspaceId,
            userId: req.user.sub,
            actionType: "FILE_DELETED",
            metadata: { fileName: file.name, fileId: id }
        }
    });

    res.json({ message: "File deleted" });
  } catch (err) {
    next(err);
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
});

// Get Specific Version Content
app.get("/api/file-versions/:versionId", auth, async (req, res, next) => {
    try {
        const { versionId } = req.params;
        const version = await prisma.fileVersion.findUnique({
            where: { id: versionId },
            include: { file: true }
        });
        if (!version) return res.status(404).json({ error: "Version not found" });

        // Access check
        const member = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId: version.file.workspaceId, userId: req.user.sub } }
        });
        if (!member) return res.status(403).json({ error: "Access denied" });

        res.json(version);
    } catch (err) {
        next(err);
    }
});

// Restore Version
app.post("/api/files/:id/restore", auth, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { versionId } = req.body;

        if (!versionId) return res.status(400).json({ error: "Version ID required" });

        const file = await prisma.projectFile.findUnique({ where: { id } });
        if (!file) return res.status(404).json({ error: "File not found" });

        const version = await prisma.fileVersion.findUnique({ where: { id: versionId } });
        if (!version) return res.status(404).json({ error: "Version not found" });

        // Access check (Editor+)
        const member = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: req.user.sub } }
        });
        if (!member || ['VIEWER'].includes(member.role)) {
            return res.status(403).json({ error: "Write access denied" });
        }

        // Save CURRENT content as a new version before restoring (Safety!)
        await prisma.fileVersion.create({
            data: {
                fileId: id,
                content: file.content,
                createdBy: req.user.sub
            }
        });

        // Update file content
        const updated = await prisma.projectFile.update({
            where: { id },
            data: { content: version.content }
        });

        // Log Activity
        await prisma.workspaceActivity.create({
            data: {
                workspaceId: file.workspaceId,
                userId: req.user.sub,
                actionType: "FILE_RESTORED",
                metadata: { fileName: file.name, fileId: id, versionId }
            }
        });

        res.json(updated);
    } catch (err) {
        next(err);
    }
});

// --- Project Export & Activity ---

// Export Workspace (ZIP)
app.get("/api/workspaces/:id/export", auth, async (req, res, next) => {
    try {
        const { id } = req.params;

        // Access check
        const member = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId: id, userId: req.user.sub } }
        });
        if (!member) return res.status(403).json({ error: "Access denied" });

        const workspace = await prisma.workspace.findUnique({ where: { id } });
        const files = await prisma.projectFile.findMany({ where: { workspaceId: id } });

        const zip = new AdmZip();
        
        // Add files to zip
        files.forEach(file => {
            // Remove leading slashes to be safe
            const cleanName = file.name.replace(/^\/+/, '');
            zip.addFile(cleanName, Buffer.from(file.content, "utf8"));
        });

        const zipBuffer = zip.toBuffer();
        
        const safeName = workspace.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', `attachment; filename=${safeName}_export.zip`);
        res.set('Content-Length', zipBuffer.length);
        
        res.send(zipBuffer);
    } catch (err) {
        next(err);
    }
});

// Get Activity Log
app.get("/api/workspaces/:id/activity", auth, async (req, res, next) => {
    try {
        const { id } = req.params;

        // Access check
        const member = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId: id, userId: req.user.sub } }
        });
        if (!member) return res.status(403).json({ error: "Access denied" });

        const activities = await prisma.workspaceActivity.findMany({
            where: { workspaceId: id },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
                user: { select: { id: true, email: true } }
            }
        });

        res.json(activities);
    } catch (err) {
        next(err);
    }
});


// Join Doc
app.post("/docs/:docId/join", auth, async (req, res, next) => {
  try {
    const { docId } = req.params;
    
    const doc = await prisma.doc.findUnique({ where: { id: docId } });
    if (!doc) return res.status(404).json({ error: "workspace not found" });

    const member = await prisma.docMember.create({
      data: {
        docId,
        userId: req.user.sub,
        role: "VIEWER",
      },
    });
    
    res.json(member);
  } catch (err) {
    next(err);
  }
});

app.post("/api/run", auth, async (req, res, next) => {
  try {
    const { fileId, code, language } = req.body;
    let content = code;
    let lang = language;
    let workspaceId = null;
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
    }
    if (!content) return res.status(400).json({ error: "No code provided" });
    const normalized = (lang || "").toLowerCase();
    const tmpDir = path.join(process.cwd(), "runner_tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    let tmpFile, command, args, prelude = "";
    if (normalized === "javascript" || normalized === "js" || normalized === "") {
      tmpFile = path.join(tmpDir, `run_${Date.now()}_${Math.random().toString(36).slice(2)}.js`);
      prelude = "global.require = () => { throw new Error('require disabled') }; global.process.exit = () => { throw new Error('exit disabled') };";
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
    } else if (normalized === "go") {
      tmpFile = path.join(tmpDir, `run_${Date.now()}_${Math.random().toString(36).slice(2)}.go`);
      command = "go";
      args = ["run", tmpFile];
    } else {
      return res.status(400).json({ error: `Language ${lang} not supported` });
    }
    let fileText = (prelude ? prelude + "\n" : "") + content;
    if (normalized === "python" || normalized === "py") {
      const pre = prelude ? prelude + "\n" : "";
      fileText = `${pre}code = ${JSON.stringify(content)}\nexec(code, {})`;
    }
    fs.writeFileSync(tmpFile, fileText, "utf8");
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
      clearTimeout(timer);
      try { fs.unlinkSync(tmpFile); } catch {}
      res.json({ stdout, stderr, exitCode: code, durationMs: Date.now() - start, workspaceId });
    });
  } catch (err) {
    next(err);
  }
});

// Judge0 Proxy Run (External Execution)
app.post("/api/judge0/run", auth, async (req, res, next) => {
  try {
    const API_KEY = process.env.RAPIDAPI_KEY;
    const HOST = "judge0-ce.p.rapidapi.com";
    const URL = "https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true";
    if (!API_KEY) {
      return res.status(500).json({ error: "RapidAPI key not configured (RAPIDAPI_KEY)" });
    }
    const { source_code, language_id, stdin, fileId } = req.body || {};
    let code = source_code;
    let langId = language_id;
    if (!code && fileId) {
      const file = await prisma.projectFile.findUnique({
        where: { id: fileId },
        select: { id: true, content: true, language: true, workspaceId: true, name: true },
      });
      if (!file) return res.status(404).json({ error: "File not found" });
      const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: file.workspaceId, userId: req.user.sub } }
      });
      if (!member) return res.status(403).json({ error: "Access denied" });
      code = file.content || "";
      const map = {
        "Python": 71,
        "JavaScript": 63,
        "TypeScript": 74,
        "C++": 54,
        "C": 50,
        "Java": 62,
        "Go": 60,
        "Rust": 73
      };
      langId = language_id || map[file.language] || 63; // default JS
    }
    if (!code || !langId) {
      return res.status(400).json({ error: "source_code and language_id required" });
    }
    const payload = {
      source_code: code,
      language_id: langId,
      stdin: typeof stdin === "string" ? stdin : ""
    };
    const r = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RapidAPI-Key": API_KEY,
        "X-RapidAPI-Host": HOST
      },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    const durationMs = data?.time ? Math.round(parseFloat(data.time) * 1000) : undefined;
    const stderr = data?.stderr || data?.compile_output || "";
    const exitCode = data?.status?.id === 3 ? 0 : (data?.exit_code ?? data?.status?.id ?? -1);
    return res.json({
      stdout: data?.stdout || "",
      stderr,
      exitCode,
      durationMs
    });
  } catch (err) {
    next(err);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "invalid input", details: err.errors });
  }
  
  // Handle unique constraint violations from Prisma
  if (err.code === 'P2002') {
    return res.status(409).json({ error: "already exists" });
  }

  req.log.error(err); // Use pino logger attached to req
  console.error("Unhandled error:", err && err.stack ? err.stack : err);
  if (err && (err.statusCode || err.status)) {
    const status = err.statusCode || err.status;
    return res.status(status).json({ error: err.message || "error" });
  }
  res.status(500).json({ error: "server error" });
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

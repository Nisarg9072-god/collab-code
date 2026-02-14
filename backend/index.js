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
    if (err.code === 'P1001' || err.message.includes('Can\'t reach database')) {
      return res.status(503).json({ error: "Database connection failed. Please check if PostgreSQL is running." });
    }
    res.status(500).json({ error: "server error" });
  }
});

// Login
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
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
    if (err.code === 'P1001' || err.message.includes('Can\'t reach database')) {
      return res.status(503).json({ error: "Database connection failed. Please check if PostgreSQL is running." });
    }
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
      // Prefer explicitly provided language from client; fallback to file record
      lang = language || file.language;
      workspaceId = file.workspaceId;
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
      command = process.env.PYTHON_PATH || "python";
      args = [tmpFile];
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API: http://localhost:${PORT}`);
});

// Keep process alive hack for sandbox
setInterval(() => {}, 10000);

import express from "express";
import cors from "cors";
import { PrismaClient, Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { z, ZodError } from "zod";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";

const app = express();
const prisma = new PrismaClient();
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

// Routes

// Register
app.post("/register", async (req, res, next) => {
  try {
    const { email, password } = registerSchema.parse(req.body);
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: { email, passHash: hashedPassword },
    });
    
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

// Login
app.post("/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user || !(await bcrypt.compare(password, user.passHash))) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ token });
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
  res.status(500).json({ error: "server error" });
});

app.listen(PORT, () => {
  console.log(`API: http://localhost:${PORT}`);
});

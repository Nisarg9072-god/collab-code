import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pkg from '@prisma/client';
const { PrismaClient, Role } = pkg;
import { z } from "zod";
const prisma = new PrismaClient();

const app = express();
app.use(cors());
app.use(express.json());
const PORT = Number(process.env.API_PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}

app.get("/health", (_req, res) => res.json({ ok: true }));

// --- Auth ---
app.post("/auth/register", async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(6) });
  try {
    const { email, password } = schema.parse(req.body);

    const passHash = await bcrypt.hash(password, 10);
    try {
      const user = await prisma.user.create({ data: { email, passHash } });
      res.json({ token: signToken(user) });
    } catch {
      res.status(409).json({ error: "email already exists" });
    }
  } catch (e) {
    res.status(400).json({ error: "invalid input" });
  }
});

app.post("/auth/login", async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
  try {
    const { email, password } = schema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.passHash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    res.json({ token: signToken(user) });
  } catch (e) {
    res.status(400).json({ error: "invalid input" });
  }
});

// --- Docs ---
app.post("/docs", auth, async (req, res) => {
  const schema = z.object({ title: z.string().min(1).max(200).optional() });
  const { title } = schema.parse(req.body);

  const doc = await prisma.doc.create({
    data: {
      title: title || "Untitled",
      ownerId: req.user.sub,
      members: { create: { userId: req.user.sub, role: Role.OWNER } },
    },
  });

  res.json(doc);
});

app.get("/docs", auth, async (req, res) => {
  const docs = await prisma.doc.findMany({
    where: { members: { some: { userId: req.user.sub } } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, ownerId: true, createdAt: true, updatedAt: true },
  });
  res.json(docs);
});

// Add member (simple invite) — owner only
app.post("/docs/:docId/members", auth, async (req, res) => {
  const { docId } = req.params;
  const schema = z.object({ email: z.string().email(), role: z.enum(["EDITOR", "VIEWER"]).default("EDITOR") });
  const { email, role } = schema.parse(req.body);

  const me = await prisma.docMember.findUnique({ where: { docId_userId: { docId, userId: req.user.sub } } });
  if (!me || me.role !== Role.OWNER) return res.status(403).json({ error: "owner only" });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: "user not found" });

  const member = await prisma.docMember.upsert({
    where: { docId_userId: { docId, userId: user.id } },
    update: { role: Role[role] },
    create: { docId, userId: user.id, role: Role[role] },
  });

  res.json(member);
});

app.listen(PORT, () => console.log(`API: http://localhost:${PORT}`));
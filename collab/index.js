import "dotenv/config";
import http from "http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import jwt from "jsonwebtoken";
import pkg from '@prisma/client';
const { PrismaClient, Role } = pkg;

const prisma = new PrismaClient();

const HOST = process.env.COLLAB_HOST || "0.0.0.0";
const PORT = Number(process.env.COLLAB_PORT || 1234);
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// In-memory doc cache (simple). For scale, add LRU/eviction.
const docs = new Map(); // docId -> { ydoc, clients:Set, saveTimer? }

async function loadDoc(docId) {
  let entry = docs.get(docId);
  if (entry) return entry;

  const ydoc = new Y.Doc();

  const stateRow = await prisma.docState.findUnique({ where: { docId } });
  if (stateRow?.state) {
    Y.applyUpdate(ydoc, new Uint8Array(stateRow.state));
  }

  entry = { ydoc, clients: new Set(), saveTimer: null };
  docs.set(docId, entry);

  // Persist on update (debounced)
  ydoc.on("update", () => {
    if (entry.saveTimer) clearTimeout(entry.saveTimer);
    entry.saveTimer = setTimeout(() => saveDoc(docId).catch(() => {}), 400);
  });

  return entry;
}

async function saveDoc(docId) {
  const entry = docs.get(docId);
  if (!entry) return;

  const update = Y.encodeStateAsUpdate(entry.ydoc);
  const bytes = Buffer.from(update);

  await prisma.docState.upsert({
    where: { docId },
    update: { state: bytes },
    create: { docId, state: bytes },
  });
}

function parseQuery(url) {
  const u = new URL(url, "http://localhost");
  return Object.fromEntries(u.searchParams.entries());
}

async function authenticateAndAuthorize(docId, token) {
  if (!token) throw new Error("missing token");
  const payload = jwt.verify(token, JWT_SECRET);
  const userId = payload.sub;

  const member = await prisma.docMember.findUnique({
    where: { docId_userId: { docId, userId } },
  });
  if (!member) throw new Error("not a member");

  return { userId, role: member.role };
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, ws: true }));
});

const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
  try {
    // Use path as docId: ws://host:1234/<docId>?token=...
    const pathname = new URL(req.url, "http://localhost").pathname;
    const docId = pathname.replace("/", "").trim();
    if (!docId) throw new Error("missing docId in path");

    const { token } = parseQuery(req.url);
    const { role } = await authenticateAndAuthorize(docId, token);

    const entry = await loadDoc(docId);
    entry.clients.add(ws);

    // Send current state
    const init = Y.encodeStateAsUpdate(entry.ydoc);
    ws.send(init);

    ws.on("message", (msg) => {
      // If viewer, ignore updates
      if (role === Role.VIEWER) return;

      const update = new Uint8Array(msg);
      Y.applyUpdate(entry.ydoc, update);

      // Broadcast to others
      for (const client of entry.clients) {
        if (client !== ws && client.readyState === 1) client.send(update);
      }
    });

    ws.on("close", () => {
      entry.clients.delete(ws);
      // Optional: if no clients, save and keep in cache; later you can evict.
      if (entry.clients.size === 0) saveDoc(docId).catch(() => {});
    });
  } catch (e) {
    try { ws.close(1008, String(e?.message || "unauthorized")); } catch {}
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Collab WS: ws://${HOST}:${PORT}/<docId>?token=...`);
});
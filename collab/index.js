import "dotenv/config";
import http from "http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import jwt from "jsonwebtoken";
import pino from "pino";
import pkg from "@prisma/client";
import Redis from "ioredis";

const { PrismaClient, Role } = pkg;
const prisma = new PrismaClient();
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const HOST = process.env.COLLAB_HOST || "0.0.0.0";
const PORT = Number(process.env.COLLAB_PORT || 1234);
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// Redis Setup
const REDIS_URL = process.env.REDIS_URL;
const INSTANCE_ID = process.env.INSTANCE_ID || "collab-" + Math.random().toString(36).slice(2);

let redisPub, redisSub;
if (REDIS_URL) {
  logger.info({ REDIS_URL }, "Connecting to Redis...");
  redisPub = new Redis(REDIS_URL);
  redisSub = new Redis(REDIS_URL);

  redisSub.subscribe("doc-updates", (err) => {
    if (err) logger.error({ err }, "Failed to subscribe to redis");
    else logger.info("Subscribed to doc-updates");
  });

  redisSub.on("message", (channel, msg) => {
    if (channel !== "doc-updates") return;
    try {
      const { docId, from, data } = JSON.parse(msg);
      if (from === INSTANCE_ID) return;

      const entry = docs.get(docId);
      if (!entry) return;

      const update = Uint8Array.from(Buffer.from(data, "base64"));
      Y.applyUpdate(entry.ydoc, update);

      entry.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(update);
        }
      });
    } catch (err) {
      logger.error({ err }, "Redis message error");
    }
  });
}

// In-memory doc cache
const docs = new Map(); // docId -> { ydoc, clients: Set, saveTimer? }

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

  // Debounced persist
  ydoc.on("update", () => {
    if (entry.saveTimer) clearTimeout(entry.saveTimer);
    entry.saveTimer = setTimeout(() => saveDoc(docId).catch((err) => {
      logger.error({ err, docId }, "Failed to save doc");
    }), 500);
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
  logger.info({ docId, bytes: bytes.length }, "Saved doc to DB");
}

async function saveSnapshot(docId) {
  const entry = docs.get(docId);
  if (!entry) return;

  const update = Y.encodeStateAsUpdate(entry.ydoc);
  await prisma.docSnapshot.create({
    data: {
      docId,
      state: Buffer.from(update),
    },
  });
  logger.info({ docId }, "Saved snapshot to DB");
}

function parseQuery(url) {
  const u = new URL(url, "http://localhost");
  return Object.fromEntries(u.searchParams.entries());
}

async function authenticateAndAuthorize(docId, token) {
  if (!token) throw new Error("missing token");
  
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    
    // Strict checks
    if (payload.typ !== "collab") throw new Error("invalid token type");
    if (payload.docId !== docId) throw new Error("doc mismatch");
    
    return { userId: payload.sub, role: payload.role };
  } catch (err) {
    throw new Error("unauthorized: " + err.message);
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "collab-server" }));
});

const wss = new WebSocketServer({ 
  server, 
  maxPayload: 1024 * 1024 // 1MB cap per message
});

// Ping/Pong keepalive
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("connection", async (ws, req) => {
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  let docId = null;
  let userId = null;

  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    docId = pathname.replace("/", "").trim();
    if (!docId) throw new Error("missing docId");

    const { token } = parseQuery(req.url);
    const { userId: uid, role } = await authenticateAndAuthorize(docId, token);
    userId = uid;

    logger.info({ userId, docId, role }, "Client connected");
    
    // Audit Log: WS_CONNECT
    await prisma.docEvent.create({
      data: { docId, userId: uid, type: "WS_CONNECT" }
    });

    const entry = await loadDoc(docId);
    entry.clients.add(ws);

    // 1. Send FULL state once on connect
    const initialParams = Y.encodeStateAsUpdate(entry.ydoc);
    ws.send(initialParams);

    // 2. Handle incremental updates
    ws.on("message", (msg) => {
      logger.info({ size: msg.length }, "Received message from client");
      if (role === Role.VIEWER) return; // Read-only

      try {
        const update = new Uint8Array(msg);
        
        // Apply to local doc
        Y.applyUpdate(entry.ydoc, update);

        // Broadcast ONLY this update (incremental)
        entry.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            client.send(update);
          }
        });
        
        // Audit Log: UPDATE (async)
        prisma.docEvent.create({
          data: { docId, userId, type: "UPDATE", bytes: update.length }
        })
        .then(() => logger.info("Audit log UPDATE created"))
        .catch(err => logger.error({ err }, "Failed to log update event"));

        // Redis Publish
        if (redisPub) {
          redisPub.publish("doc-updates", JSON.stringify({
            docId,
            from: INSTANCE_ID,
            data: Buffer.from(update).toString("base64"),
          })).catch(err => logger.error({ err }, "Redis publish failed"));
        }

      } catch (err) {
        logger.error({ err, docId }, "Error processing update");
      }
    });

    ws.on("close", async () => {
      entry.clients.delete(ws);
      logger.info({ userId, docId }, "Client disconnected");
      if (entry.clients.size === 0) {
        // Last user left: save doc state AND snapshot
        await saveDoc(docId);
        await saveSnapshot(docId);
      }
    });

  } catch (err) {
    logger.error({ err: err.message }, "Connection rejected");
    ws.close(1008, "Unauthorized");
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down...");
  clearInterval(interval);
  
  const saves = [];
  for (const [docId] of docs) {
    saves.push(saveDoc(docId));
    saves.push(saveSnapshot(docId));
  }
  await Promise.all(saves);
  
  await prisma.$disconnect();
  if (redisPub) redisPub.quit();
  if (redisSub) redisSub.quit();
  process.exit(0);
});

server.listen(PORT, HOST, () => {
  logger.info(`Collab server running on ws://${HOST}:${PORT}`);
});

import "dotenv/config";
import http from "http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import jwt from "jsonwebtoken";
import pino from "pino";
import pg from "pg";
import Redis from "ioredis";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const HOST = process.env.COLLAB_HOST || "0.0.0.0";
const PORT = Number(process.env.COLLAB_PORT || 1234);
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const REDIS_URL = process.env.REDIS_URL;
const INSTANCE_ID = process.env.INSTANCE_ID || "collab-" + Math.random().toString(36).slice(2);

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let redisPub, redisSub;
if (REDIS_URL) {
  logger.info({ REDIS_URL }, "Connecting to Redis...");
  redisPub = new Redis(REDIS_URL);
  redisSub = new Redis(REDIS_URL);
  redisSub.subscribe("doc-updates");
  redisSub.on("message", (channel, msg) => {
    try {
      const { docId, from, data } = JSON.parse(msg);
      if (from === INSTANCE_ID) return;
      const entry = docs.get(docId);
      if (entry) {
        Y.applyUpdate(entry.ydoc, Uint8Array.from(Buffer.from(data, "base64")));
        entry.clients.forEach(c => c.readyState === 1 && c.send(Uint8Array.from(Buffer.from(data, "base64"))));
      }
    } catch { }
  });
}

// In-memory doc cache
const docs = new Map(); // fileId -> { ydoc, clients: Set, saveTimer? }

async function loadDoc(fileId) {
  let entry = docs.get(fileId);
  if (entry) return entry;

  const ydoc = new Y.Doc();
  // Try to load from project_file_yjs_states
  const { rows } = await pool.query("SELECT state FROM project_file_yjs_states WHERE file_id = $1", [fileId]);

  if (rows[0]?.state) {
    Y.applyUpdate(ydoc, new Uint8Array(rows[0].state));
  } else {
    // If no Yjs state, try initial load from project_files content
    const { rows: fileRows } = await pool.query("SELECT content FROM project_files WHERE id = $1", [fileId]);
    if (fileRows[0]?.content) {
      const text = ydoc.getText("monaco");
      text.insert(0, fileRows[0].content);
    }
  }

  entry = { ydoc, clients: new Set(), saveTimer: null };
  docs.set(fileId, entry);

  // Debounced persist
  ydoc.on("update", () => {
    if (entry.saveTimer) clearTimeout(entry.saveTimer);
    entry.saveTimer = setTimeout(() => saveDoc(fileId).catch((err) => {
      logger.error({ err, fileId }, "Failed to save doc");
    }), 2000); // 2s debounce
  });

  return entry;
}

async function saveDoc(fileId) {
  const entry = docs.get(fileId);
  if (!entry) return;

  const update = Y.encodeStateAsUpdate(entry.ydoc);
  // Also push to project_files to keep REST fallback updated
  const text = entry.ydoc.getText("monaco").toString();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO project_file_yjs_states (file_id, state, updated_at) VALUES ($1, $2, now()) 
                       ON CONFLICT (file_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`, [fileId, Buffer.from(update)]);
    await client.query(`UPDATE project_files SET content = $1, updated_at = now() WHERE id = $2`, [text, fileId]);
    await client.query("COMMIT");
    logger.info({ fileId, bytes: update.length }, "Saved doc to DB");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally { client.release(); }
}

function parseQuery(url) {
  const u = new URL(url, "http://localhost");
  return Object.fromEntries(u.searchParams.entries());
}

async function authenticateAndAuthorize(fileId, token) {
  if (!token) throw new Error("missing token");
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.typ !== "collab") throw new Error("invalid token type");

  // fileId in collab token must match path
  const reqFileId = payload.docId; // For simplicity we called it docId in the token
  if (reqFileId !== fileId) throw new Error("doc mismatch");

  // Verify membership in DB (Strict check)
  const { rows } = await pool.query(`
    SELECT m.role FROM room_members m 
    JOIN project_files f ON f.room_id = m.room_id 
    WHERE f.id = $1 AND m.user_id = $2`, [fileId, payload.sub]);

  if (!rows[0]) throw new Error("Unauthorized access to file");
  return { userId: payload.sub, role: rows[0].role };
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "collab-server" }));
});

const wss = new WebSocketServer({
  server,
  maxPayload: 10 * 1024 * 1024 // 10MB cap
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

  let fileId = null;
  let userId = null;

  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    fileId = pathname.replace("/", "").trim();
    if (!fileId) throw new Error("missing fileId");

    const { token } = parseQuery(req.url);
    const { userId: uid, role } = await authenticateAndAuthorize(fileId, token);
    userId = uid;

    logger.info({ userId, fileId, role }, "Client connected");

    const entry = await loadDoc(fileId);
    entry.clients.add(ws);

    // 1. Send FULL state once on connect
    const initialParams = Y.encodeStateAsUpdate(entry.ydoc);
    ws.send(initialParams);

    // 2. Handle incremental updates
    ws.on("message", (msg) => {
      if (role === 'VIEWER') return;

      try {
        const update = new Uint8Array(msg);
        Y.applyUpdate(entry.ydoc, update);

        entry.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            client.send(update);
          }
        });

        if (redisPub) {
          redisPub.publish("doc-updates", JSON.stringify({
            docId: fileId,
            from: INSTANCE_ID,
            data: Buffer.from(update).toString("base64"),
          })).catch(err => logger.error({ err }, "Redis publish failed"));
        }
      } catch (err) {
        logger.error({ err, fileId }, "Error processing update");
      }
    });

    ws.on("close", async () => {
      if (entry) {
        entry.clients.delete(ws);
        if (entry.clients.size === 0) {
          await saveDoc(fileId);
        }
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
  }
  await Promise.allSettled(saves);

  if (redisPub) redisPub.quit();
  if (redisSub) redisSub.quit();
  pool.end();
  process.exit(0);
});

server.listen(PORT, HOST, () => {
  logger.info(`Collab server running on ws://${HOST}:${PORT}`);
});

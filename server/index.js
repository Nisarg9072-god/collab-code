import http from "http";
import express from "express";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { pathToFileURL } from "url";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 1234);

// ---- Resolve y-websocket internal utils file by disk path (bypass exports) ----
const require = createRequire(import.meta.url);
const ywsEntry = require.resolve("y-websocket"); // resolves to the package main entry

function findPkgRoot(startFile) {
  let dir = path.dirname(startFile);
  while (true) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg?.name === "y-websocket") return dir;
      } catch {}
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate y-websocket package root");
}

const ywsRoot = findPkgRoot(ywsEntry);

const candidates = [
  path.join(ywsRoot, "bin", "utils.js"),
  path.join(ywsRoot, "dist", "bin", "utils.js"),
  path.join(ywsRoot, "dist", "utils.js"),
  path.join(ywsRoot, "src", "utils.js"),
  path.join(ywsRoot, "..", "@y", "websocket-server", "src", "utils.js"),
];

const utilsPath = candidates.find((p) => fs.existsSync(p));
if (!utilsPath) {
  throw new Error(
    "Cannot find y-websocket utils.js. Searched:\n" + candidates.join("\n")
  );
}

const { setupWSConnection } = await import(pathToFileURL(utilsPath).href);
// ---------------------------------------------------------------------------

const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true, ws: true, port: PORT });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (conn, req) => {
  setupWSConnection(conn, req, { gc: true });
});

server.listen(PORT, HOST, () => {
  console.log(`HTTP health: http://${HOST}:${PORT}/health`);
  console.log(`Yjs WS: ws://${HOST}:${PORT}`);
});

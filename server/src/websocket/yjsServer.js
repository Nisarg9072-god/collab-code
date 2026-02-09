const http = require("http");
const WebSocket = require("ws");
const { setupWSConnection } = require("y-websocket/bin/utils.js");

const PORT = process.env.PORT || 1234;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Yjs WebSocket server running ✅");
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (conn, req) => {
  setupWSConnection(conn, req, { gc: true });
});

server.listen(PORT, () => {
  console.log(`✅ Yjs WebSocket server running on ws://localhost:${PORT}`);
});

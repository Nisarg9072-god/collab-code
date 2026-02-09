const WebSocket = require("ws");
const Y = require("yjs");

const docId = process.env.DOC_ID;
const token = process.env.TOKEN;
if (!docId || !token) {
  console.error("Set DOC_ID and TOKEN env vars.");
  process.exit(1);
}

const ws = new WebSocket(`ws://127.0.0.1:1234/${docId}?token=${token}`);

const ydoc = new Y.Doc();
ydoc.on("update", (u) => console.log("local update bytes:", u.length));

ws.on("open", () => {
  console.log("WS OPEN");
  // after initial sync, modify doc
  setTimeout(() => {
    const ytext = ydoc.getText("monaco");
    ytext.insert(0, "hello-from-ws-test\n");
    const upd = Y.encodeStateAsUpdate(ydoc);
    ws.send(Buffer.from(upd));
    console.log("sent update bytes:", upd.length);
  }, 700);
});

ws.on("message", (buf) => {
  const u = new Uint8Array(buf);
  Y.applyUpdate(ydoc, u);
  const txt = ydoc.getText("monaco").toString();
  console.log("received update, current text:\n" + txt);
});

ws.on("close", (c, r) => console.log("WS CLOSED", c, r.toString()));
ws.on("error", (e) => console.log("WS ERROR", e.message));
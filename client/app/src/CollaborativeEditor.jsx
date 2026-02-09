import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";

export default function CollaborativeEditor() {
  const [status, setStatus] = useState("connecting...");
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const bindingRef = useRef(null);

  // IMPORTANT: Same room name => same shared document
  const ROOM = "hackathon-room";
  const WS_URL = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:1234";

  useEffect(() => {
    // 1) Create shared Yjs document in memory
    const ydoc = new Y.Doc();

    // 2) Connect it to your websocket server
    //    Room decides which shared doc users join
    const provider = new WebsocketProvider(WS_URL, ROOM, ydoc);

    ydocRef.current = ydoc;
    providerRef.current = provider;

    // Optional status display
    provider.on("status", (e) => setStatus(e.status));

    // Cleanup on refresh/close
    return () => {
      try { bindingRef.current?.destroy(); } catch {}
      try { provider.destroy(); } catch {}
      try { ydoc.destroy(); } catch {}
    };
  }, [WS_URL]);

  // Called when Monaco Editor is ready
  const onMount = (editor) => {
    const ydoc = ydocRef.current;
    const provider = providerRef.current;
    if (!ydoc || !provider) return;

    // This is the shared text (like a Google Doc body)
    const ytext = ydoc.getText("monaco");

    // Connect Yjs shared text <-> Monaco model
    bindingRef.current = new MonacoBinding(
      ytext,
      editor.getModel(),
      new Set([editor]),
      provider.awareness
    );
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 8, fontFamily: "system-ui" }}>
        <b>Status:</b> {status} &nbsp; | &nbsp; <b>WS:</b> {WS_URL} &nbsp; | &nbsp; <b>Room:</b> {ROOM}
      </div>

      <Editor
        height="100%"
        theme="vs-dark"
        defaultLanguage="javascript"
        defaultValue="// Type here in 2 tabs to test collaboration\n"
        options={{ minimap: { enabled: false }, automaticLayout: true }}
        onMount={onMount}
      />
    </div>
  );
}

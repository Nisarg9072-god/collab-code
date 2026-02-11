import { useRef } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type { ConnectionStatus } from "@/pages/WorkspaceEditor";
import { Loader2 } from "lucide-react";

interface CodeEditorProps {
  code: string;
  language: string;
  onChange: (code: string) => void;
  collaborators: { name: string; status: "online" | "idle" | "offline" }[];
  connectionStatus: ConnectionStatus;
}

const CodeEditor = ({ code, language, onChange, collaborators, connectionStatus }: CodeEditorProps) => {
  const editorRef = useRef<any>(null);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
  };

  const isReadOnly = connectionStatus === "offline";

  // Map language to Monaco language IDs
  const getMonacoLanguage = (lang: string) => {
    const map: Record<string, string> = {
      "TypeScript": "typescript",
      "JavaScript": "javascript",
      "Python": "python",
      "Java": "java",
      "Go": "go",
      "Rust": "rust",
      "HTML": "html",
      "CSS": "css",
      "JSON": "json",
      "Markdown": "markdown",
      "SQL": "sql"
    };
    return map[lang] || "plaintext";
  };

  return (
    <div className="relative flex flex-1 overflow-hidden bg-[#1e1e1e]">
      {/* Status Banners */}
      {connectionStatus === "reconnecting" && (
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-2 bg-yellow-500/10 py-1.5 text-xs text-yellow-500 border-b border-yellow-500/20 backdrop-blur-sm">
          <Loader2 className="h-3 w-3 animate-spin" />
          Reconnecting...
        </div>
      )}
      {connectionStatus === "offline" && (
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-2 bg-red-500/10 py-1.5 text-xs text-red-500 border-b border-red-500/20 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          Offline — read-only mode
        </div>
      )}

      <Editor
        height="100%"
        defaultLanguage="typescript"
        language={getMonacoLanguage(language)}
        theme="vs-dark"
        value={code}
        onChange={(value) => onChange(value || "")}
        onMount={handleEditorDidMount}
        options={{
          readOnly: isReadOnly,
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
          lineHeight: 24,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 16, bottom: 16 },
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          formatOnPaste: true,
          formatOnType: true,
        }}
        loading={
          <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading editor...</span>
          </div>
        }
      />
    </div>
  );
};

export default CodeEditor;

import { useRef, useCallback } from "react";
import type { ConnectionStatus } from "@/pages/WorkspaceEditor";

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  collaborators: { name: string; status: "online" | "idle" | "offline" }[];
  connectionStatus: ConnectionStatus;
}

// Simple syntax highlighting - maps token types to design system classes
const highlightLine = (line: string): JSX.Element[] => {
  const tokens: JSX.Element[] = [];
  let i = 0;

  // Simple patterns
  const patterns: [RegExp, string][] = [
    [/^(\/\/.*)/, "text-syntax-comment"],
    [/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/, "text-syntax-string"],
    [/^(\b(?:function|const|let|var|return|import|export|interface|type|if|else|for|while|class|new|this)\b)/, "text-syntax-keyword"],
    [/^(\b\d+(?:\.\d+)?\b)/, "text-syntax-number"],
    [/^(\b[A-Z][a-zA-Z0-9]*\b)/, "text-syntax-type"],
    [/^([{}()\[\];:.,=<>!+\-*/&|?])/, "text-syntax-operator"],
    [/^(\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\())/, "text-syntax-function"],
    [/^(\b[a-zA-Z_$][a-zA-Z0-9_$]*\b)/, "text-syntax-variable"],
    [/^(\s+)/, ""],
  ];

  let remaining = line;
  let key = 0;

  while (remaining.length > 0) {
    let matched = false;
    for (const [pattern, cls] of patterns) {
      const m = remaining.match(pattern);
      if (m) {
        tokens.push(
          <span key={key++} className={cls}>{m[1]}</span>
        );
        remaining = remaining.slice(m[1].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push(<span key={key++}>{remaining[0]}</span>);
      remaining = remaining.slice(1);
    }
  }

  return tokens;
};

const CodeEditor = ({ code, onChange, collaborators, connectionStatus }: CodeEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lines = code.split("\n");

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const isReadOnly = connectionStatus === "offline";

  return (
    <div className="relative flex flex-1 overflow-hidden bg-editor-bg">
      {/* Reconnecting banner */}
      {connectionStatus === "reconnecting" && (
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-2 bg-status-reconnecting/10 py-1.5 text-xs text-status-reconnecting border-b border-status-reconnecting/20">
          <span className="h-1.5 w-1.5 rounded-full bg-status-reconnecting animate-pulse-subtle" />
          Reconnecting…
        </div>
      )}
      {connectionStatus === "offline" && (
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-2 bg-status-offline/10 py-1.5 text-xs text-status-offline border-b border-status-offline/20">
          <span className="h-1.5 w-1.5 rounded-full bg-status-offline" />
          Offline — read-only mode
        </div>
      )}

      {/* Gutter */}
      <div className="flex flex-col items-end py-4 pr-4 pl-4 select-none bg-editor-gutter font-mono text-xs leading-6 text-editor-line-number">
        {lines.map((_, i) => (
          <span key={i} className="block h-6">{i + 1}</span>
        ))}
      </div>

      {/* Code display layer */}
      <div className="relative flex-1 overflow-auto">
        {/* Highlighted code */}
        <pre className="pointer-events-none absolute inset-0 py-4 px-0 font-mono text-sm leading-6 whitespace-pre text-syntax-variable">
          {lines.map((line, i) => (
            <div key={i} className="h-6 px-2">
              {highlightLine(line)}
            </div>
          ))}
        </pre>

        {/* Editable textarea overlay */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={handleInput}
          readOnly={isReadOnly}
          spellCheck={false}
          className="relative z-[1] h-full w-full resize-none bg-transparent py-4 px-2 font-mono text-sm leading-6 text-transparent caret-primary outline-none selection:bg-editor-selection"
          style={{ caretColor: "hsl(174, 62%, 47%)" }}
        />

        {/* Mock collaborator cursors */}
        {collaborators
          .filter((c) => c.status === "online")
          .map((c, i) => {
            const cursorLine = 12 + i * 3;
            const cursorCol = 8 + i * 5;
            const colors = [
              "hsl(35, 90%, 55%)",
              "hsl(280, 60%, 60%)",
            ];
            return (
              <div
                key={c.name}
                className="pointer-events-none absolute z-[2]"
                style={{
                  top: `${cursorLine * 24 + 16}px`,
                  left: `${cursorCol * 8.4 + 8}px`,
                }}
              >
                <div
                  className="h-5 w-0.5 animate-cursor-blink"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                <span
                  className="absolute -top-4 left-0 whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: colors[i % colors.length],
                    color: "hsl(220, 20%, 6%)",
                  }}
                >
                  {c.name}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default CodeEditor;

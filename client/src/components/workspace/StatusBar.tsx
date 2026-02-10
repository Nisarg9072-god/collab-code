import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/pages/WorkspaceEditor";

interface StatusBarProps {
  connectionStatus: ConnectionStatus;
  language: string;
  cursorLine: number;
  cursorCol: number;
  lineCount: number;
}

const StatusBar = ({ connectionStatus, language, cursorLine, cursorCol, lineCount }: StatusBarProps) => {
  return (
    <div className="flex h-6 items-center justify-between border-t border-border bg-card px-3 text-[11px] text-muted-foreground">
      {/* Left — Connection */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            connectionStatus === "connected" && "bg-status-online",
            connectionStatus === "reconnecting" && "bg-status-reconnecting animate-pulse-subtle",
            connectionStatus === "offline" && "bg-status-offline"
          )}
        />
        <span className="capitalize">{connectionStatus}</span>
      </div>

      {/* Center */}
      <div className="flex items-center gap-4">
        <span>{language}</span>
        <span>UTF-8</span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        <span>Ln {cursorLine}, Col {cursorCol}</span>
        <span>{lineCount} lines</span>
      </div>
    </div>
  );
};

export default StatusBar;

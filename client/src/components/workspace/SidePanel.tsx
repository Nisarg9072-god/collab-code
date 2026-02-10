import { useState } from "react";
import { FileText, Users, Activity, Plus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidePanelProps {
  files: { id: string; name: string; active: boolean }[];
  participants: { name: string; status: "online" | "idle" | "offline" }[];
  activity: { message: string; time: string }[];
  activeFileId: string | null;
  onFileSelect: (id: string) => void;
  onFileCreate?: () => void;
}

type Tab = "files" | "participants" | "activity";

const SidePanel = ({ files, participants, activity, activeFileId, onFileSelect, onFileCreate }: SidePanelProps) => {
  const [tab, setTab] = useState<Tab>("files");

  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: "files", label: "Files", icon: FileText },
    { id: "participants", label: "Users", icon: Users },
    { id: "activity", label: "Activity", icon: Activity },
  ];

  return (
    <div className="flex h-full w-56 flex-shrink-0 flex-col border-r border-border bg-card">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs transition-colors",
              tab === id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {tab === "files" && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Workspace files
              </span>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onFileCreate}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {files.map((file) => (
              <button
                key={file.id}
                onClick={() => onFileSelect(file.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2 py-1.5 text-sm transition-colors",
                  activeFileId === file.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="font-mono text-xs">{file.name}</span>
                </div>
                <MoreHorizontal className="h-3 w-3 opacity-0 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        )}

        {tab === "participants" && (
          <div className="space-y-1">
            <span className="block px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Connected ({participants.filter(p => p.status === "online").length})
            </span>
            {participants.map((p) => (
              <div key={p.name} className="flex items-center gap-2.5 rounded px-2 py-1.5 text-sm">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    p.status === "online" && "bg-status-online",
                    p.status === "idle" && "bg-status-idle",
                    p.status === "offline" && "bg-status-offline"
                  )}
                />
                <span className={cn(
                  "text-xs",
                  p.status === "online" ? "text-foreground" : "text-muted-foreground"
                )}>
                  {p.name}
                </span>
                {p.status === "idle" && (
                  <span className="ml-auto text-[10px] text-muted-foreground">idle</span>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "activity" && (
          <div className="space-y-1">
            <span className="block px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Recent
            </span>
            {activity.map((a, i) => (
              <div key={i} className="flex items-center justify-between rounded px-2 py-1.5">
                <span className="text-xs text-muted-foreground">{a.message}</span>
                <span className="text-[10px] text-muted-foreground/60">{a.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SidePanel;

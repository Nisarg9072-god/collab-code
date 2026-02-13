import { useState, useMemo } from "react";
import { FileText, Users, Activity, Plus, MoreHorizontal, FolderPlus, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SidePanelProps {
  files: { id: string; name: string; active: boolean }[];
  participants: { name: string; status: "online" | "idle" | "offline" }[];
  activity: { message: string; time: string }[];
  activeFileId: string | null;
  onFileSelect: (id: string) => void;
  onFileCreate?: () => void;
  onFolderCreate?: (name: string) => void;
  onCreateFileInFolder?: (folder: string, fileName: string) => void;
  onRenameFile?: (fileId: string, newFullName: string) => void;
  onDeleteFile?: (fileId: string) => void;
  onRenameFolder?: (folder: string, newFolderName: string) => void;
  onDeleteFolder?: (folder: string) => void;
  width?: number;
}

type Tab = "files" | "participants" | "activity";

const SidePanel = ({ files, participants, activity, activeFileId, onFileSelect, onFileCreate, onFolderCreate, onCreateFileInFolder, onRenameFile, onDeleteFile, onRenameFolder, onDeleteFolder, width }: SidePanelProps) => {
  const [tab, setTab] = useState<Tab>("files");
  const [newFolder, setNewFolder] = useState<string>("");
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [folderFileInputOpen, setFolderFileInputOpen] = useState<Record<string, boolean>>({});
  const [folderFileInputs, setFolderFileInputs] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState<{ x: number; y: number; type: "file" | "folder"; fileId?: string; fileInnerName?: string; folder?: string } | null>(null);

  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: "files", label: "Files", icon: FileText },
    { id: "participants", label: "Users", icon: Users },
    { id: "activity", label: "Activity", icon: Activity },
  ];

  const { rootFiles, folderMap } = useMemo(() => {
    const root: typeof files = [];
    const map: Record<string, typeof files> = {};
    for (const f of files) {
      const parts = f.name.split("/");
      if (parts.length > 1) {
        const folder = parts[0];
        const innerName = parts.slice(1).join("/");
        if (!map[folder]) map[folder] = [];
        if (innerName.startsWith(".keep")) {
          continue;
        }
        const item = { ...f, name: innerName };
        map[folder].push(item);
      } else {
        root.push(f);
      }
    }
    return { rootFiles: root, folderMap: map };
  }, [files]);

  return (
    <div className="flex h-full flex-shrink-0 flex-col border-r border-border bg-card" style={{ width: width || 224, minWidth: 160 }}>
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
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onFileCreate}>
                  <Plus className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowFolderInput(!showFolderInput)}>
                  <FolderPlus className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {showFolderInput && (
              <div className="flex items-center gap-2 px-2 py-1">
                <input
                  className="flex-1 rounded bg-muted/40 px-2 py-1 text-xs"
                  placeholder="folder name (e.g. src)"
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFolder.trim().length > 0) {
                      onFolderCreate && onFolderCreate(newFolder.trim());
                      setNewFolder("");
                      setShowFolderInput(false);
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (newFolder.trim().length > 0) {
                      onFolderCreate && onFolderCreate(newFolder.trim());
                      setNewFolder("");
                      setShowFolderInput(false);
                    }
                  }}
                >
                  Create
                </Button>
              </div>
            )}
            {/* Folders */}
            {Object.keys(folderMap).sort().map((folder) => {
              const open = openFolders[folder] ?? true;
              return (
                <div key={folder} className="mb-1">
                  <button
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, type: "folder", folder });
                    }}
                    onClick={() => setOpenFolders(prev => ({ ...prev, [folder]: !open }))}
                  >
                    <div className="flex items-center gap-2">
                      {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      <span className="font-mono text-xs">{folder}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderFileInputOpen(prev => ({ ...prev, [folder]: !(prev[folder] ?? false) }));
                        }}
                        title="New file in folder"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </button>
                  {open && (
                    <div className="ml-4">
                      {folderFileInputOpen[folder] && (
                        <div className="flex items-center gap-2 px-2 py-1">
                          <Input
                            className="h-7 text-xs"
                            placeholder="new file name (e.g. main.py)"
                            value={folderFileInputs[folder] ?? ""}
                            onChange={(e) => setFolderFileInputs(prev => ({ ...prev, [folder]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const name = (folderFileInputs[folder] ?? "").trim();
                                if (name.length > 0) {
                                  onCreateFileInFolder && onCreateFileInFolder(folder, name);
                                  setFolderFileInputs(prev => ({ ...prev, [folder]: "" }));
                                  setFolderFileInputOpen(prev => ({ ...prev, [folder]: false }));
                                }
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const name = (folderFileInputs[folder] ?? "").trim();
                              if (name.length > 0) {
                                onCreateFileInFolder && onCreateFileInFolder(folder, name);
                                setFolderFileInputs(prev => ({ ...prev, [folder]: "" }));
                                setFolderFileInputOpen(prev => ({ ...prev, [folder]: false }));
                              }
                            }}
                          >
                            Create
                          </Button>
                        </div>
                      )}
                      {folderMap[folder].map((file) => (
                        <button
                          key={file.id}
                          onClick={() => onFileSelect(file.id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setMenu({ x: e.clientX, y: e.clientY, type: "file", fileId: file.id, fileInnerName: file.name, folder });
                          }}
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
                </div>
              );
            })}
            {/* Root files */}
            {rootFiles.map((file) => (
              <button
                key={file.id}
                onClick={() => onFileSelect(file.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, type: "file", fileId: file.id, fileInnerName: file.name });
                }}
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
      {menu && (
        <div
          className="absolute z-50 rounded-md border border-border bg-card text-xs shadow-lg"
          style={{ left: menu.x, top: menu.y, minWidth: 160 }}
          onMouseLeave={() => setMenu(null)}
        >
          {menu.type === "file" ? (
            <div className="py-1">
              <button
                className="w-full text-left px-3 py-1 hover:bg-muted"
                onClick={() => {
                  setMenu(null);
                  if (!menu.fileId) return;
                  const base = window.prompt("Rename file to:", menu.folder ? `${menu.fileInnerName}` : menu.fileInnerName || "");
                  if (base && base.trim().length > 0) {
                    const newFull = menu.folder ? `${menu.folder}/${base.trim()}` : base.trim();
                    onRenameFile && onRenameFile(menu.fileId, newFull);
                  }
                }}
              >
                Rename
              </button>
              <button
                className="w-full text-left px-3 py-1 hover:bg-muted"
                onClick={() => {
                  setMenu(null);
                  if (!menu.fileId) return;
                  const ok = window.confirm("Delete this file?");
                  if (ok) onDeleteFile && onDeleteFile(menu.fileId);
                }}
              >
                Delete
              </button>
            </div>
          ) : (
            <div className="py-1">
              <button
                className="w-full text-left px-3 py-1 hover:bg-muted"
                onClick={() => {
                  setMenu(null);
                  if (!menu.folder) return;
                  setFolderFileInputOpen(prev => ({ ...prev, [menu.folder!]: true }));
                }}
              >
                New File
              </button>
              <button
                className="w-full text-left px-3 py-1 hover:bg-muted"
                onClick={() => {
                  setMenu(null);
                  if (!menu.folder) return;
                  const base = window.prompt("Rename folder to:", menu.folder);
                  if (base && base.trim().length > 0) {
                    onRenameFolder && onRenameFolder(menu.folder, base.trim());
                  }
                }}
              >
                Rename Folder
              </button>
              <button
                className="w-full text-left px-3 py-1 hover:bg-muted"
                onClick={() => {
                  setMenu(null);
                  if (!menu.folder) return;
                  const ok = window.confirm("Delete this folder and its files?");
                  if (ok) onDeleteFolder && onDeleteFolder(menu.folder);
                }}
              >
                Delete Folder
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SidePanel;

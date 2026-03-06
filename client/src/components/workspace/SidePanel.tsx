import { useState, useMemo } from "react";
import { FileText, Users, Activity, Plus, MoreHorizontal, FolderPlus, ChevronRight, ChevronDown, Folder } from "lucide-react";
import { Button } from "@/components/UI/button";
import { cn } from "@/lib/utils";
import { FileNode, buildFileTree } from "@/lib/fileUtils";
import { Awareness } from 'y-protocols/awareness';

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
  hideTabs?: boolean;
  initialTab?: Tab;
  awareness?: Awareness | null;
}

type Tab = "files" | "participants" | "activity";

const FileTreeItem = ({
  node,
  level,
  activeFileId,
  onFileSelect,
  openFolders,
  toggleFolder,
  onContextMenu,
  onNewFileInFolder
}: {
  node: FileNode;
  level: number;
  activeFileId: string | null;
  onFileSelect: (id: string) => void;
  openFolders: Record<string, boolean>;
  toggleFolder: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, type: "file" | "folder", node: FileNode) => void;
  onNewFileInFolder: (folderPath: string) => void;
}) => {
  const isOpen = openFolders[node.id] ?? true;

  if (node.type === 'folder') {
    return (
      <div className="flex flex-col">
        <button
          onClick={() => toggleFolder(node.id)}
          onContextMenu={(e) => onContextMenu(e, "folder", node)}
          className="flex items-center gap-1.5 px-2 py-1 hover:bg-muted/50 rounded transition-colors w-full text-left group"
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          {isOpen ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
          <Folder size={14} className="text-blue-400/80 fill-blue-400/20" />
          <span className="text-[11px] font-medium truncate flex-1">{node.name}</span>
          <Plus
            size={12}
            className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onNewFileInFolder(node.id.replace('folder-', ''));
            }}
          />
        </button>
        {isOpen && node.children?.map(child => (
          <FileTreeItem
            key={child.id}
            node={child}
            level={level + 1}
            activeFileId={activeFileId}
            onFileSelect={onFileSelect}
            openFolders={openFolders}
            toggleFolder={toggleFolder}
            onContextMenu={onContextMenu}
            onNewFileInFolder={onNewFileInFolder}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onFileSelect(node.id)}
      onContextMenu={(e) => onContextMenu(e, "file", node)}
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded transition-colors w-full text-left group",
        activeFileId === node.id ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
      )}
      style={{ paddingLeft: `${level * 12 + 24}px` }}
    >
      <FileText size={14} className={cn(activeFileId === node.id ? "text-primary" : "text-muted-foreground")} />
      <span className="text-[11px] truncate flex-1">{node.name}</span>
      <MoreHorizontal size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
};

const SidePanel = ({
  files,
  participants,
  activity,
  activeFileId,
  onFileSelect,
  onFileCreate,
  onFolderCreate,
  onCreateFileInFolder,
  onRenameFile,
  onDeleteFile,
  onRenameFolder,
  onDeleteFolder,
  width,
  hideTabs = false,
  initialTab = "files",
  awareness
}: SidePanelProps) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ x: number; y: number; type: "file" | "folder"; node: FileNode } | null>(null);
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const fileTree = useMemo(() => buildFileTree(files), [files]);

  const toggleFolder = (id: string) => {
    setOpenFolders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleContextMenu = (e: React.MouseEvent, type: "file" | "folder", node: FileNode) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, type, node });
  };

  const handleNewFileInFolder = (folderPath: string) => {
    const fileName = window.prompt(`New file in ${folderPath}:`);
    if (fileName && fileName.trim()) {
      onCreateFileInFolder?.(folderPath, fileName.trim());
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: "files", label: "Files", icon: FileText },
    { id: "participants", label: "Users", icon: Users },
    { id: "activity", label: "Activity", icon: Activity },
  ];

  const awarenessStates = useMemo(() => {
    if (!awareness) return [];
    return Array.from(awareness.getStates().values());
  }, [awareness]);

  return (
    <div className="flex h-full flex-shrink-0 flex-col border-r border-border bg-card/50 relative" style={{ width: hideTabs ? '100%' : (width || 224), minWidth: hideTabs ? 0 : 160 }}>
      {/* Tab bar */}
      {!hideTabs && (
        <div className="flex border-b border-border shrink-0">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors",
                tab === id
                  ? "border-b-2 border-primary text-foreground bg-muted/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/10"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {tab === "files" && (
          <div className="flex flex-col py-2">
            <div className="flex items-center justify-between px-4 py-1 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Explorer
              </span>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-muted" onClick={onFileCreate} title="New File">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-muted" onClick={() => setShowFolderInput(!showFolderInput)} title="New Folder">
                  <FolderPlus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {showFolderInput && (
              <div className="px-4 py-2 flex items-center gap-2">
                <input
                  autoFocus
                  className="flex-1 bg-muted/50 border border-border rounded px-2 py-1 text-[11px] outline-none focus:border-primary"
                  placeholder="folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFolderName.trim()) {
                      onFolderCreate?.(newFolderName.trim());
                      setNewFolderName("");
                      setShowFolderInput(false);
                    } else if (e.key === 'Escape') {
                      setShowFolderInput(false);
                    }
                  }}
                />
              </div>
            )}

            <div className="px-1">
              {fileTree.map(node => (
                <FileTreeItem
                  key={node.id}
                  node={node}
                  level={0}
                  activeFileId={activeFileId}
                  onFileSelect={onFileSelect}
                  openFolders={openFolders}
                  toggleFolder={toggleFolder}
                  onContextMenu={handleContextMenu}
                  onNewFileInFolder={handleNewFileInFolder}
                />
              ))}
            </div>
          </div>
        )}

        {tab === "participants" && (
          <div className="flex flex-col py-4 px-2 space-y-4">
            <div className="px-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Connected ({awarenessStates.length})
              </span>
            </div>
            <div className="space-y-0.5">
              {awarenessStates.map((state: any) => (
                <div key={state.user.name} className="flex items-center gap-2.5 rounded px-2 py-1.5 text-xs hover:bg-muted/30 transition-colors">
                  <div className="relative">
                    <div className={cn(
                      "h-2 w-2 rounded-full",
                      "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                    )} />
                  </div>
                  <span className={cn(
                    "truncate",
                    "text-foreground font-medium"
                  )}>
                    {state.user.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "activity" && (
          <div className="flex flex-col py-4 px-2 space-y-4">
            <div className="px-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Timeline
              </span>
            </div>
            <div className="space-y-3 px-2">
              {activity.map((a, i) => (
                <div key={i} className="flex flex-col gap-1 border-l border-border pl-3 relative py-1">
                  <div className="absolute left-[-4.5px] top-2 w-2 h-2 rounded-full bg-border border-2 border-card" />
                  <span className="text-[11px] text-foreground leading-relaxed">{a.message}</span>
                  <span className="text-[10px] text-muted-foreground italic">{a.time}</span>
                </div>
              ))}
              {activity.length === 0 && (
                <div className="text-[11px] text-muted-foreground italic px-2">No recent activity</div>
              )}
            </div>
          </div>
        )}
      </div>

      {menu && (
        <div
          className="fixed z-[100] rounded-md border border-border bg-card text-[11px] shadow-lg py-1 min-w-[140px]"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
        >
          {menu.type === "file" ? (
            <>
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
                onClick={() => {
                  setMenu(null);
                  const newName = window.prompt("Rename file:", menu.node.name);
                  if (newName && newName.trim()) {
                    onRenameFile?.(menu.node.id, newName.trim());
                  }
                }}
              >
                Rename
              </button>
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-rose-500/10 text-rose-500 transition-colors"
                onClick={() => {
                  setMenu(null);
                  if (window.confirm(`Delete ${menu.node.name}?`)) {
                    onDeleteFile?.(menu.node.id);
                  }
                }}
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors font-semibold"
                onClick={() => {
                  setMenu(null);
                  handleNewFileInFolder(menu.node.id.replace('folder-', ''));
                }}
              >
                New File
              </button>
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-muted transition-colors"
                onClick={() => {
                  setMenu(null);
                  const newName = window.prompt("Rename folder:", menu.node.name);
                  if (newName && newName.trim()) {
                    onRenameFolder?.(menu.node.id.replace('folder-', ''), newName.trim());
                  }
                }}
              >
                Rename Folder
              </button>
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-rose-500/10 text-rose-500 transition-colors"
                onClick={() => {
                  setMenu(null);
                  if (window.confirm(`Delete folder ${menu.node.name} and all its contents?`)) {
                    onDeleteFolder?.(menu.node.id.replace('folder-', ''));
                  }
                }}
              >
                Delete Folder
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SidePanel;

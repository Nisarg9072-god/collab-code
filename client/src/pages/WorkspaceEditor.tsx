import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import TopBar from "@/components/workspace/TopBar";
import SidePanel from "@/components/workspace/SidePanel";
import CodeEditor from "@/components/workspace/CodeEditor";
import StatusBar from "@/components/workspace/StatusBar";
import ShareModal from "@/components/workspace/ShareModal";
import VersionHistory from "@/components/workspace/VersionHistory";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/UI/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { FileText, Users, Activity } from "lucide-react";

export type ConnectionStatus = "connected" | "reconnecting" | "offline";

interface File {
    id: string;n
    name: string;
    language: string;
    content?: string;
    updatedAt?: string;
}

const WorkspaceEditor = () => {
  const { id } = useParams<{ id: string }>();
  const [shareOpen, setShareOpen] = useState(false);
  const [language, setLanguage] = useState("TypeScript");
  const [connectionStatus] = useState<ConnectionStatus>("connected");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // File State
  const [files, setFiles] = useState<File[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);

  // Version History & Auto-save State
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Activity State
  const [activity, setActivity] = useState<{ message: string; time: string }[]>([]);

  // Create File State
  const [createOpen, setCreateOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [runLoading, setRunLoading] = useState(false);
  const [runStdin, setRunStdin] = useState("");
  const [promptFields, setPromptFields] = useState<string[]>([]);
  const [runHistory, setRunHistory] = useState<{ stdout: string; stderr: string; exitCode: number; durationMs: number; language: string; when: string }[]>([]);
  const [terminalHeight, setTerminalHeight] = useState<number>(240);
  const [dragging, setDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [dragStartHeight, setDragStartHeight] = useState<number>(240);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiWidth, setAiWidth] = useState<number>(() => {
    const v = localStorage.getItem("cc.aiWidth");
    return v ? parseInt(v, 10) : 320;
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const v = localStorage.getItem("cc.sidebarWidth");
    return v ? parseInt(v, 10) : 240;
  });
  const [dragSidebar, setDragSidebar] = useState(false);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragStartSidebarWidth, setDragStartSidebarWidth] = useState<number>(240);
  const [dragAi, setDragAi] = useState(false);
  const [dragStartAiX, setDragStartAiX] = useState<number | null>(null);
  const [dragStartAiWidth, setDragStartAiWidth] = useState<number>(320);
  const [prevTerminalHeight, setPrevTerminalHeight] = useState<number>(240);
  const terminalRef =  useRef<HTMLDivElement | null>(null);
  const [bottomTab, setBottomTab] = useState<string>(() => localStorage.getItem("cc.bottomTab") || "terminal");
  const [problems, setProblems] = useState<Array<{
    message: string;
    severity: number;
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  }>>([]);
  const [aiPrompt, setAiPrompt] = useState("");


  const MOCK_PARTICIPANTS = [
    { name: "You", status: "online" as const },
  ];

  // Fetch files and activity
  useEffect(() => {
    if (id) {
        setLoading(true);
        Promise.all([
            api.files.list(id),
            api.workspaces.activity(id)
        ]).then(([fetchedFiles, fetchedActivity]) => {
            setFiles(fetchedFiles);
            if (fetchedFiles.length > 0) {
                setActiveFileId(fetchedFiles[0].id);
            }
            
            // Process activity
            const processedActivity = fetchedActivity.map((a: any) => {
                let actionText = a.actionType.replace(/_/g, ' ').toLowerCase();
                // Simple formatting
                if (a.actionType === 'FILE_UPDATED') actionText = 'updated file';
                if (a.actionType === 'FILE_CREATED') actionText = 'created file';
                if (a.actionType === 'FILE_DELETED') actionText = 'deleted file';
                if (a.actionType === 'FILE_RESTORED') actionText = 'restored file';
                
                const fileName = a.metadata?.fileName || 'a file';
                const userEmail = a.user?.email || 'Unknown user';
                
                return {
                    message: `${userEmail} ${actionText} ${fileName}`,
                    time: formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })
                };
            });
            setActivity(processedActivity);

        }).catch(err => {
            console.error(err);
            toast({ variant: "destructive", title: "Error", description: "Failed to load workspace data" });
        }).finally(() => setLoading(false));
    }
  }, [id]);

  useEffect(() => {
    const v = localStorage.getItem("cc.terminalHeight");
    if (v) {
      const num = parseInt(v, 10);
      if (!Number.isNaN(num)) setTerminalHeight(num);
    }
  }, []);

  useEffect(() => {
    if (language === "Python") {
      const re = /input\s*\(\s*(['"])(.*?)\1\s*\)/g;
      const found: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(code)) !== null) {
        found.push(m[2]);
      }
      if (found.length > 0) {
        setPromptFields(found);
      } else {
        setPromptFields([]);
      }
    } else {
      setPromptFields([]);
    }
  }, [code, language]);

  useEffect(() => {
    localStorage.setItem("cc.terminalHeight", String(terminalHeight));
  }, [terminalHeight]);

  useEffect(() => {
    localStorage.setItem("cc.sidebarWidth", String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem("cc.aiWidth", String(aiWidth));
  }, [aiWidth]);

  useEffect(() => {
    localStorage.setItem("cc.bottomTab", bottomTab);
  }, [bottomTab]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging && dragStartY !== null) {
        const dy = e.clientY - dragStartY;
        const next = Math.min(Math.max(dragStartHeight + dy, 140), window.innerHeight - 160);
        setTerminalHeight(next);
      }
      if (dragSidebar && dragStartX !== null) {
        const dx = e.clientX - dragStartX;
        const next = Math.min(Math.max(dragStartSidebarWidth + dx, 160), Math.floor(window.innerWidth * 0.5));
        setSidebarWidth(next);
      }
      if (dragAi && dragStartAiX !== null) {
        const dx = dragStartAiX - e.clientX;
        const base = dragStartAiWidth;
        const next = Math.min(Math.max(base + dx, 260), Math.floor(window.innerWidth * 0.5));
        setAiWidth(next);
      }
    };
    const onUp = () => {
      if (dragging) {
        setDragging(false);
        setDragStartY(null);
      }
      if (dragSidebar) {
        setDragSidebar(false);
        setDragStartX(null);
      }
      if (dragAi) {
        setDragAi(false);
        setDragStartAiX(null);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, dragStartY, dragStartHeight, dragSidebar, dragStartX, dragStartSidebarWidth, dragAi, dragStartAiX, dragStartAiWidth]);

  // Language detection helper
  const detectLanguage = (name: string, content: string, fallback: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "js" || ext === "jsx") return "JavaScript";
    if (ext === "ts" || ext === "tsx") return "TypeScript";
    if (ext === "py") return "Python";
    if (ext === "go") return "Go";
    if (ext === "rs") return "Rust";
    if (ext === "html") return "HTML";
    if (ext === "css") return "CSS";
    if (ext === "json") return "JSON";
    if (ext === "md" || ext === "markdown") return "Markdown";
    if (ext === "sql") return "SQL";
    if (content?.startsWith("#!")) {
      if (content.includes("python")) return "Python";
      if (content.includes("node")) return "JavaScript";
    }
    if (/\bdef\s+\w+\(/.test(content) || /\bprint\(.+\)/.test(content)) return "Python";
    if (/console\.log\(.+\)/.test(content) || /\bfunction\s+\w+\(/.test(content)) return "JavaScript";
    return fallback || "JavaScript";
  };

  // Fetch content when activeFileId changes
  useEffect(() => {
    if (activeFileId) {
        const file = files.find(f => f.id === activeFileId);
        if (file) {
            // If we have content in memory (or it's empty string which is valid), use it
            // But if we only have list info (no content field), fetch it
            if (file.content === undefined) {
                 api.files.get(activeFileId).then(fullFile => {
                     setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: fullFile.content } : f));
                     setCode(fullFile.content || "");
                     const detected = detectLanguage(fullFile.name, fullFile.content, fullFile.language);
                     setLanguage(detected);
                     if (detected !== fullFile.language) {
                       api.files.update(activeFileId, { language: detected }).catch(() => {});
                     }
                 }).catch(err => {
                     console.error(err);
                     toast({ variant: "destructive", title: "Error", description: "Failed to load file content" });
                 });
            } else {
                setCode(file.content);
                const detected = detectLanguage(file.name, file.content, file.language);
                setLanguage(detected);
                if (detected !== file.language) {
                  api.files.update(activeFileId, { language: detected }).catch(() => {});
                }
            }
        }
    } else {
        setCode("");
    }
  }, [activeFileId]);

  // Save on change (debounced)
  useEffect(() => {
      const timeout = setTimeout(() => {
          if (activeFileId) {
              const file = files.find(f => f.id === activeFileId);
              if (file && file.content !== code) {
                  setSaveStatus("saving");
                  // Optimistic update
                  setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: code } : f));
                  
                  api.files.update(activeFileId, { content: code })
                    .then(() => {
                        setSaveStatus("saved");
                        setLastSavedAt(new Date());
                    })
                    .catch(err => {
                        console.error("Auto-save failed", err);
                        setSaveStatus("error");
                        toast({ variant: "destructive", title: "Save Failed", description: "Your changes could not be saved." });
                    });
              }
          }
      }, 1000);
      return () => clearTimeout(timeout);
  }, [code, activeFileId]);

  const handleRestoreVersion = async (versionId: string) => {
      if (!activeFileId || !id) return;
      // The API restores the content and creates a new version
      // We need to update our local state with the restored content
      // We can fetch the restored file content or just assume the version content is now the file content
      // But best to fetch the updated file to be sure
      const updatedFile = await api.files.restore(activeFileId, versionId);
      // Assuming updatedFile contains the content
      // If the API returns the file object with content:
      if (updatedFile && updatedFile.content) {
          setCode(updatedFile.content);
          setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: updatedFile.content } : f));
          setSaveStatus("saved");
          setLastSavedAt(new Date());
      } else {
          // Fallback: fetch the file again
          const f = await api.files.get(activeFileId);
          setCode(f.content);
          setFiles(prev => prev.map(file => file.id === activeFileId ? { ...file, content: f.content } : file));
      }

      // Refresh activity
      api.workspaces.activity(id).then(fetchedActivity => {
         const processedActivity = fetchedActivity.map((a: any) => {
            let actionText = a.actionType.replace(/_/g, ' ').toLowerCase();
            if (a.actionType === 'FILE_UPDATED') actionText = 'updated file';
            if (a.actionType === 'FILE_CREATED') actionText = 'created file';
            if (a.actionType === 'FILE_DELETED') actionText = 'deleted file';
            if (a.actionType === 'FILE_RESTORED') actionText = 'restored file';
            const fileName = a.metadata?.fileName || 'a file';
            const userEmail = a.user?.email || 'Unknown user';
            return {
                message: `${userEmail} ${actionText} ${fileName}`,
                time: formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })
            };
        });
        setActivity(processedActivity);
      });
  };

  const handleCreateFile = async () => {
      if (!id || !newFileName) return;
      try {
          const inferLanguage = (name: string) => {
            const ext = name.split(".").pop()?.toLowerCase();
            switch (ext) {
              case "js":
              case "jsx":
                return "JavaScript";
              case "ts":
              case "tsx":
                return "TypeScript";
              case "py":
                return "Python";
              case "go":
                return "Go";
              case "rs":
                return "Rust";
              case "html":
                return "HTML";
              case "css":
                return "CSS";
              case "json":
                return "JSON";
              case "md":
              case "markdown":
                return "Markdown";
              case "sql":
                return "SQL";
              default:
                return "JavaScript";
            }
          };
          const lang = inferLanguage(newFileName);
          const newFile = await api.files.create(id, newFileName, "", lang);
          setFiles(prev => [...prev, newFile]);
          setActiveFileId(newFile.id);
          setLanguage(lang);
          setCreateOpen(false);
          setNewFileName("");
          toast({ title: "Success", description: "File created" });
          // Refresh activity
          api.workspaces.activity(id).then(fetchedActivity => {
             const processedActivity = fetchedActivity.map((a: any) => {
                let actionText = a.actionType.replace(/_/g, ' ').toLowerCase();
                if (a.actionType === 'FILE_UPDATED') actionText = 'updated file';
                if (a.actionType === 'FILE_CREATED') actionText = 'created file';
                if (a.actionType === 'FILE_DELETED') actionText = 'deleted file';
                if (a.actionType === 'FILE_RESTORED') actionText = 'restored file';
                const fileName = a.metadata?.fileName || 'a file';
                const userEmail = a.user?.email || 'Unknown user';
                return {
                    message: `${userEmail} ${actionText} ${fileName}`,
                    time: formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })
                };
            });
            setActivity(processedActivity);
          });
      } catch (err: any) {
          toast({ variant: "destructive", title: "Error", description: err.message });
      }
  };

  const handleExport = async () => {
      if (!id) return;
      try {
          const blob = await api.workspaces.export(id);
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `workspace-${id}-export.zip`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          toast({ title: "Success", description: "Project exported successfully" });
      } catch (err) {
          console.error(err);
          toast({ variant: "destructive", title: "Export Failed", description: "Could not export project." });
      }
  };

  const activeFileObj = files.find(f => f.id === activeFileId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar
        workspaceId={id || "unknown"}
        activeFile={activeFileObj?.name || "No file selected"}
        language={language}
        onLanguageChange={(lang) => {
          setLanguage(lang);
          if (activeFileId) {
            api.files.update(activeFileId, { language: lang }).catch(() => {});
          }
        }}
        onRun={async () => {
          if (!activeFileId) return;
          setRunLoading(true);
          try {
            if (language === "Python" && /\binput\(/.test(code) && (!runStdin || runStdin.trim() === "")) {
              setRunLoading(false);
              toast({ title: "Input required", description: "Provide stdin in the terminal input and run." });
              setRunHistory(prev => [
                { stdout: "Program is waiting for input.\nProvide stdin in the terminal input and press Run.", stderr: "", exitCode: -1, durationMs: 0, language, when: new Date().toLocaleTimeString() },
                ...prev
              ].slice(0, 20));
              return;
            }
            const stdinNormalized = runStdin && runStdin.length > 0 ? (runStdin.endsWith("\n") ? runStdin : runStdin + "\n") : runStdin;
            const idMap: Record<string, number> = { Python: 71, JavaScript: 63, TypeScript: 74, "C++": 54, C: 50, Java: 62, Go: 60, Rust: 73 };
            const langId = idMap[language] || 63;
            let result;
            try {
              result = await api.runner.runJudge0(code, langId, stdinNormalized, activeFileId);
            } catch (err) {
              // Fallback to local runner if Judge0 is unavailable or key missing
              result = await api.runner.runFile(activeFileId, language, stdinNormalized);
            }
            setRunHistory(prev => [
              { stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.exitCode, durationMs: result.durationMs, language, when: new Date().toLocaleTimeString() },
              ...prev
            ].slice(0, 20));
            setTimeout(() => {
              if (terminalRef.current) {
                terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
              }
            }, 0);
          } catch (e: any) {
            const msg = e?.message || "Run failed";
            toast({ variant: "destructive", title: "Run failed", description: msg });
            setRunHistory(prev => [
              { stdout: "", stderr: msg, exitCode: -1, durationMs: 0, language, when: new Date().toLocaleTimeString() },
              ...prev
            ].slice(0, 20));
          } finally {
            setRunLoading(false);
          }
        }}
        onShare={() => setShareOpen(true)}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        sidebarOpen={sidebarOpen}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        onShowHistory={() => activeFileId && setHistoryOpen(true)}
        onExport={handleExport}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {sidebarOpen && (
          <SidePanel
            files={files.map(f => ({ id: f.id, name: f.name, active: f.id === activeFileId }))}
            participants={MOCK_PARTICIPANTS}
            activity={activity} 
            activeFileId={activeFileId}
            onFileSelect={setActiveFileId}
            onFileCreate={() => setCreateOpen(true)}
            onFolderCreate={async (folderName: string) => {
              if (!id) return;
              const clean = folderName.trim().replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "");
              if (!clean) return;
              try {
                const marker = await api.files.create(id, `${clean}/.keep`, "", "plaintext");
                setFiles(prev => [...prev, marker]);
                toast({ title: "Folder created", description: clean });
              } catch (e: any) {
                toast({ variant: "destructive", title: "Create failed", description: e?.message || "Could not create folder" });
              }
            }}
            onCreateFileInFolder={async (folder, fileName) => {
              if (!id) return;
              const base = fileName.trim().replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "");
              if (!base) return;
              const full = `${folder}/${base}`;
              try {
                const inferLanguage = (name: string) => {
                  const ext = name.split(".").pop()?.toLowerCase();
                  switch (ext) {
                    case "js":
                    case "jsx":
                      return "JavaScript";
                    case "ts":
                    case "tsx":
                      return "TypeScript";
                    case "py":
                      return "Python";
                    case "go":
                      return "Go";
                    case "rs":
                      return "Rust";
                    case "html":
                      return "HTML";
                    case "css":
                      return "CSS";
                    case "json":
                      return "JSON";
                    case "md":
                    case "markdown":
                      return "Markdown";
                    case "sql":
                      return "SQL";
                    default:
                      return "JavaScript";
                  }
                };
                const lang = inferLanguage(full);
                const newFile = await api.files.create(id, full, "", lang);
                setFiles(prev => [...prev, newFile]);
                setActiveFileId(newFile.id);
                setLanguage(lang);
                toast({ title: "File created", description: full });
              } catch (e: any) {
                toast({ variant: "destructive", title: "Create failed", description: e?.message || "Could not create file" });
              }
            }}
            onRenameFile={async (fileId, newFullName) => {
              try {
                const updated = await api.files.update(fileId, { name: newFullName });
                setFiles(prev => prev.map(f => f.id === fileId ? { ...f, name: updated.name } : f));
                if (activeFileId === fileId) {
                  setLanguage(detectLanguage(updated.name, code, updated.language));
                }
                toast({ title: "Renamed", description: updated.name });
              } catch (e: any) {
                toast({ variant: "destructive", title: "Rename failed", description: e?.message || "Could not rename file" });
              }
            }}
            onDeleteFile={async (fileId) => {
              try {
                await api.files.delete(fileId);
                setFiles(prev => prev.filter(f => f.id !== fileId));
                if (activeFileId === fileId) {
                  setActiveFileId(null);
                  setCode("");
                }
                toast({ title: "Deleted", description: "File removed" });
              } catch (e: any) {
                toast({ variant: "destructive", title: "Delete failed", description: e?.message || "Could not delete file" });
              }
            }}
            onRenameFolder={async (folder, newFolderName) => {
              if (!id) return;
              const from = folder.replace(/\/+$/,"");
              const to = newFolderName.trim().replace(/\/+/g,"/").replace(/^\//,"").replace(/\/$/,"");
              if (!to) return;
              try {
                const targets = files.filter(f => f.name.startsWith(from + "/"));
                for (const f of targets) {
                  const rest = f.name.slice(from.length + 1);
                  const newName = `${to}/${rest}`;
                  await api.files.update(f.id, { name: newName });
                }
                const refreshed = await api.files.list(id);
                setFiles(refreshed);
                toast({ title: "Folder renamed", description: `${from} → ${to}` });
              } catch (e: any) {
                toast({ variant: "destructive", title: "Rename failed", description: e?.message || "Could not rename folder" });
              }
            }}
            onDeleteFolder={async (folder) => {
              if (!id) return;
              try {
                const targets = files.filter(f => f.name.startsWith(folder + "/"));
                for (const f of targets) {
                  await api.files.delete(f.id);
                }
                const refreshed = await api.files.list(id);
                setFiles(refreshed);
                if (activeFileId && !refreshed.find((f: any) => f.id === activeFileId)) {
                  setActiveFileId(null);
                  setCode("");
                }
                toast({ title: "Folder deleted", description: folder });
              } catch (e: any) {
                toast({ variant: "destructive", title: "Delete failed", description: e?.message || "Could not delete folder" });
              }
            }}
            width={sidebarWidth}
          />
        )}
        {!sidebarOpen && (
          <div className="flex h-full w-12 flex-shrink-0 flex-col border-r border-border bg-card items-center py-2 gap-2">
            <button
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted/40"
              title="Files"
              onClick={() => setSidebarOpen(true)}
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted/40"
              title="Users"
              onClick={() => setSidebarOpen(true)}
            >
              <Users className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted/40"
              title="Activity"
              onClick={() => setSidebarOpen(true)}
            >
              <Activity className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        )}
        {sidebarOpen && (
          <div
            className="h-full w-1 cursor-col-resize bg-transparent hover:bg-border"
            onMouseDown={(e) => {
              setDragSidebar(true);
              setDragStartX(e.clientX);
              setDragStartSidebarWidth(sidebarWidth);
            }}
          />
        )}
        {files.length === 0 ? (
            <div className="flex flex-1 items-center justify-center flex-col gap-4 text-muted-foreground bg-background">
                <FileText className="h-12 w-12 opacity-20" />
                <p>No files in this workspace</p>
                <Button onClick={() => setCreateOpen(true)} variant="secondary">Create File</Button>
            </div>
        ) : !activeFileId ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground bg-background">
                <p>Select a file to edit</p>
            </div>
        ) : (
            <CodeEditor
              code={code}
              language={language}
              onChange={setCode}
              collaborators={MOCK_PARTICIPANTS.filter(p => p.name !== "You")}
              connectionStatus={connectionStatus}
              onDiagnosticsChange={setProblems}
            />
        )}
        {aiOpen && (
          <div className="flex h-full flex-shrink-0 flex-col border-l border-border bg-card" style={{ width: aiWidth }}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs text-muted-foreground">AI Assistant</span>
              <Button size="sm" variant="ghost" onClick={() => setAiOpen(false)}>Close</Button>
            </div>
            <div className="p-3 space-y-2">
              <label className="text-[11px] text-muted-foreground">Prompt</label>
              <textarea
                className="w-full h-24 rounded-md border border-border bg-muted/30 p-2 text-xs font-mono"
                placeholder="Ask about the code or request changes"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm">Ask</Button>
                <Button size="sm" variant="outline" onClick={() => setAiOpen(false)}>Hide</Button>
                <Button size="sm" variant="secondary" onClick={() => setRunStdin(aiPrompt)}>Send to stdin</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const latest = runHistory[0];
                  const txt = latest ? `${latest.stdout}${latest.stderr ? "\n" + latest.stderr : ""}` : "";
                  setAiPrompt(txt);
                }}>Use output</Button>
              </div>
              <div className="mt-3 text-[11px] text-muted-foreground">Response</div>
              <div className="h-40 overflow-auto font-mono text-xs bg-black text-green-400 px-3 py-2 rounded-md">
                <div>(No response yet)</div>
              </div>
            </div>
          </div>
        )}
        {aiOpen && (
          <div
            className="h-full w-1 cursor-col-resize bg-transparent hover:bg-border"
            onMouseDown={(e) => {
              setDragAi(true);
              setDragStartAiX(e.clientX);
              setDragStartAiWidth(aiWidth);
            }}
          />
        )}
        {!aiOpen && (
          <button
            className="absolute top-2 right-2 z-10 rounded-md border border-border bg-card px-2 py-1 text-xs"
            onClick={() => setAiOpen(true)}
          >
            AI
          </button>
        )}
      </div>

      <StatusBar
        connectionStatus={connectionStatus}
        language={language}
        cursorLine={1}
        cursorCol={1}
        lineCount={code.split('\n').length}
      />

      {/* Create File Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-background border-border">
            <DialogHeader>
                <DialogTitle>Create New File</DialogTitle>
            </DialogHeader>
            <div className="py-4">
                <Input 
                    placeholder="filename.ts" 
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateFile}>Create</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <VersionHistory 
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        fileId={activeFileId}
        onRestore={handleRestoreVersion}
      />
      <div
        className="border-t border-border bg-card/30"
        style={{ height: terminalHeight }}
      >
          <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
          <div className="flex gap-2">
            <button
              className={bottomTab === "terminal" ? "px-2 py-1 rounded bg-muted text-foreground" : "px-2 py-1 rounded hover:bg-muted/40"}
              onClick={() => setBottomTab("terminal")}
            >
              Terminal
            </button>
            <button
              className={bottomTab === "output" ? "px-2 py-1 rounded bg-muted text-foreground" : "px-2 py-1 rounded hover:bg-muted/40"}
              onClick={() => setBottomTab("output")}
            >
              Output
            </button>
            <button
              className={bottomTab === "problems" ? "px-2 py-1 rounded bg-muted text-foreground" : "px-2 py-1 rounded hover:bg-muted/40"}
              onClick={() => setBottomTab("problems")}
            >
              Problems
            </button>
              <button
                className={bottomTab === "debug" ? "px-2 py-1 rounded bg-muted text-foreground" : "px-2 py-1 rounded hover:bg-muted/40"}
                onClick={() => setBottomTab("debug")}
              >
                Debug Console
              </button>
          </div>
          <span>{runHistory.length > 0 ? `Last: ${runHistory[0].when} • ${runHistory[0].language}` : "Idle"}</span>
        </div>
        <div
          className="h-2 w-full cursor-row-resize hover:bg-border"
          onMouseDown={(e) => {
            setDragging(true);
            setDragStartY(e.clientY);
            setDragStartHeight(terminalHeight);
          }}
          onDoubleClick={() => {
            if (terminalHeight < window.innerHeight * 0.5) {
              setPrevTerminalHeight(terminalHeight);
              setTerminalHeight(Math.floor(window.innerHeight * 0.7));
            } else {
              setTerminalHeight(prevTerminalHeight);
            }
          }}
        />
        {bottomTab === "terminal" && (
        <div className="px-3 pb-2">
          <label className="text-[11px] text-muted-foreground">Program Input (stdin)</label>
          <textarea
            className="w-full h-16 rounded-md border border-border bg-muted/30 p-2 text-xs font-mono"
            placeholder={promptFields.length > 0 ? `Enter ${promptFields.length} line(s), one per input()` : "Enter input for your program, e.g. 12"}
            value={runStdin}
            onChange={(e) => setRunStdin(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => {
              if (!activeFileId) return;
              setRunLoading(true);
              const stdinNormalized = runStdin && runStdin.length > 0 ? (runStdin.endsWith("\n") ? runStdin : runStdin + "\n") : runStdin;
              const idMap: Record<string, number> = { Python: 71, JavaScript: 63, TypeScript: 74, "C++": 54, C: 50, Java: 62, Go: 60, Rust: 73 };
              const langId = idMap[language] || 63;
              // Try Judge0 first; fallback to local
              api.runner.runJudge0(code, langId, stdinNormalized, activeFileId)
                .then(result => {
                  setRunHistory(prev => [
                    { stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.exitCode, durationMs: result.durationMs, language, when: new Date().toLocaleTimeString() },
                    ...prev
                  ].slice(0, 20));
                  setTimeout(() => {
                    if (terminalRef.current) {
                      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
                    }
                  }, 0);
                })
                .catch(() => api.runner.runFile(activeFileId, language, stdinNormalized)
                  .then(result => {
                    setRunHistory(prev => [
                      { stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.exitCode, durationMs: result.durationMs, language, when: new Date().toLocaleTimeString() },
                      ...prev
                    ].slice(0, 20));
                    setTimeout(() => {
                      if (terminalRef.current) {
                        terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
                      }
                    }, 0);
                  })
                  .catch(e => {
                    const msg = e?.message || "Run failed";
                    toast({ variant: "destructive", title: "Run failed", description: msg });
                    setRunHistory(prev => [
                      { stdout: "", stderr: msg, exitCode: -1, durationMs: 0, language, when: new Date().toLocaleTimeString() },
                      ...prev
                    ].slice(0, 20));
                  }))
                .finally(() => setRunLoading(false));
            }}>{runLoading ? "Running..." : "Run"}</Button>
            <Button size="sm" variant="outline" onClick={() => setRunHistory([])}>Clear</Button>
            <Button size="sm" variant="outline" onClick={() => {
              if (runHistory.length === 0) return;
              const latest = runHistory[0];
              const text = `[${latest.when}] ${latest.language} • exit ${latest.exitCode} in ${latest.durationMs}ms\n${latest.stdout}${latest.stderr ? "\n" + latest.stderr : ""}`;
              navigator.clipboard.writeText(text).then(() => {
                toast({ title: "Copied", description: "Output copied to clipboard" });
              }).catch(() => {
                toast({ title: "Copy failed", description: "Could not copy to clipboard" });
              });
            }}>Copy</Button>
          </div>
        </div>
        )}
        {bottomTab === "output" && (
          <div className="overflow-auto font-mono text-xs bg-black text-green-400 px-3 py-2" style={{ height: Math.max(terminalHeight - 60, 80) }}>
            {runHistory.length === 0 ? (
              <div>No output yet</div>
            ) : (
              runHistory.map((h, i) => (
                <div key={i} className="mb-3">
                  <div className="text-[10px] text-muted-foreground">[{h.when}] {h.language} • exit {h.exitCode} in {h.durationMs}ms</div>
                  <div className="whitespace-pre-wrap">{h.stdout}</div>
                  {h.stderr && <div className="whitespace-pre-wrap text-red-400">{h.stderr}</div>}
                </div>
              ))
            )}
          </div>
        )}
        {bottomTab === "terminal" && (
        <div ref={terminalRef} className="overflow-auto font-mono text-xs bg-black text-green-400 px-3 py-2" style={{ height: Math.max(terminalHeight - 120, 80) }}>
          {runHistory.length === 0 ? (
            <div>Waiting for program output...</div>
          ) : (
            runHistory.map((h, i) => (
              <div key={i} className="mb-3">
                <div className="text-[10px] text-muted-foreground">[{h.when}] {h.language} • exit {h.exitCode} in {h.durationMs}ms</div>
                <div className="whitespace-pre-wrap">{h.stdout}</div>
                {h.stderr && <div className="whitespace-pre-wrap text-red-400">{h.stderr}</div>}
              </div>
            ))
          )}
        </div>
        )}
        {bottomTab === "problems" && (
          <div className="overflow-auto font-mono text-xs bg-black text-yellow-300 px-3 py-2" style={{ height: Math.max(terminalHeight - 60, 80) }}>
            {problems.length === 0 ? (
              <div>No problems</div>
            ) : (
              problems.map((p, i) => (
                <div key={i} className="mb-2">
                  <div className="text-[10px] text-muted-foreground">Ln {p.startLineNumber}:{p.startColumn} • Sev {p.severity}</div>
                  <div className="whitespace-pre-wrap">{p.message}</div>
                </div>
              ))
            )}
          </div>
        )}
        {bottomTab === "debug" && (
          <div className="overflow-auto font-mono text-xs bg-black text-blue-300 px-3 py-2" style={{ height: Math.max(terminalHeight - 60, 80) }}>
            {runHistory.length === 0 ? (
              <div>No debug logs</div>
            ) : (
              runHistory.map((h, i) => (
                <div key={i} className="mb-3">
                  <div className="text-[10px] text-muted-foreground">[{h.when}] • exit {h.exitCode} in {h.durationMs}ms</div>
                  <div className="whitespace-pre-wrap">{JSON.stringify(h, null, 2)}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkspaceEditor;

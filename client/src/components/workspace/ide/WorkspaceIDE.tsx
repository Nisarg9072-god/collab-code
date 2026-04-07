
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { useCollaborationSession } from "@/hooks/useCollaborationSession";

// IDE Components
import WorkspaceIDELayout from "./WorkspaceIDELayout";
import MonacoEditor from "./MonacoEditor";
import TerminalPanel from "./TerminalPanel";
import { XTermTerminalHandle } from "./XTermTerminal";
import { MonacoRef, EditorTab, SidebarSection, BottomTab } from "./types";
import ProblemsPanel from "@/components/workspace/ProblemsPanel";
import { Diagnostic } from "@/features/diagnostics/diagnosticsTypes";
import { diagnosticsStore } from "@/features/diagnostics/diagnosticsStore";
import { toMonacoMarker } from "@/features/diagnostics/diagnosticsHelper";
import { parseDiagnostics } from "@/features/diagnostics/diagnosticsParser";
import { useSearchStore } from "@/features/search/searchStore";
import { SearchPanel } from "@/components/workspace/SearchPanel";
import { SearchMatch } from "@/features/search/searchTypes";
import { useGitStore } from "@/features/git/gitStore";
import { SourceControlPanel } from "@/components/workspace/SourceControlPanel";
import { CommandPalette } from "@/components/workspace/CommandPalette";
import { useCommandStore } from "@/features/commands/commandStore";
import { commands } from "@/features/commands/commands";
import { useThemeStore } from "@/features/theme/themeStore";
import { initLSP } from "@/features/lsp/lspService";
import { AIAssistantPanel } from "@/components/workspace/AIAssistantPanel";
import { useAIStore } from "@/features/ai/aiStore";

// Original Components
import TopBar from "@/components/workspace/TopBar";
import SidePanel from "@/components/workspace/SidePanel";
import ShareModal from "@/components/workspace/ShareModal";
import VersionHistory from "@/components/workspace/VersionHistory";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/UI/dialog";
import { Input } from "@/components/UI/input";
import { Button } from "@/components/UI/button";

interface File {
    id: string;
    name: string;
    language: string;
    content?: string;
    updatedAt?: string;
}

const WorkspaceIDE = () => {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  
  // Existing States from WorkspaceEditor
  const [shareOpen, setShareOpen] = useState(false);
  const [language, setLanguage] = useState("TypeScript");
  const [connectionStatus] = useState<"connected" | "reconnecting" | "offline">("connected");
  
  const [files, setFiles] = useState<File[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [activity, setActivity] = useState<{ message: string; time: string }[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [runLoading, setRunLoading] = useState(false);
  const [runStdin, setRunStdin] = useState("");
  const [runHistory, setRunHistory] = useState<{ stdout: string; stderr: string; exitCode: number; durationMs: number; language: string; when: string }[]>([]);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [ideState, setIdeState] = useState<IDEState>(() => {
    const saved = localStorage.getItem('cc.ideState');
    if (saved) return JSON.parse(saved);
    return {
      sidebar: {
        visible: true,
        width: 260,
        activeSection: 'explorer'
      },
      panel: {
        visible: true,
        height: 240,
        activeTab: 'terminal'
      },
      editor: {
        openFiles: [],
        activeFileId: null
      }
    };
  });

  useEffect(() => {
    localStorage.setItem('cc.ideState', JSON.stringify(ideState));
  }, [ideState]);
  
  // IDE specific states (mostly handled by Layout, but we need some here)
  const [openFileIds, setOpenFileIds] = useState<string[]>(() => {
    const saved = localStorage.getItem(`cc.openFiles.${id}`);
    return saved ? JSON.parse(saved) : [];
  });
  
  const { provider } = useCollaborationSession({
    workspaceId: id || '',
    fileId: activeFileId || '',
    token,
    editor: null, // We will set the editor later
  });

  // Logic: Sync openFileIds with activeFileId
  useEffect(() => {
    if (activeFileId && !openFileIds.includes(activeFileId)) {
      setOpenFileIds(prev => {
        const next = [...prev, activeFileId];
        localStorage.setItem(`cc.openFiles.${id}`, JSON.stringify(next));
        return next;
      });
    }
  }, [activeFileId, id]);

  const [workspaceName, setWorkspaceName] = useState("");
  const terminalRef = useRef<XTermTerminalHandle>(null);
  const editorRef = useRef<MonacoRef>(null);
  const filesRef = useRef<File[]>([]);
  
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Shift + F: Search
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        // We need a way to change the layout state from here.
        // Currently layout state is internal to WorkspaceIDELayout.
        // I'll add a comment that this requires a layout state lift or global store.
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setIsCommandPaletteOpen((open) => !open);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const { registerCommand } = useCommandStore();
  useEffect(() => {
    const commandActions = {
      "file.create": () => setCreateOpen(true),
      "file.save": handleSave,
      "view.toggleTerminal": () => setIdeState(prev => ({ ...prev, panel: { ...prev.panel, visible: !prev.panel.visible } })),
      "view.toggleFileExplorer": () => setIdeState(prev => ({ ...prev, sidebar: { ...prev.sidebar, visible: !prev.sidebar.visible, activeSection: 'explorer' } })),
      "view.toggleSearch": () => setIdeState(prev => ({ ...prev, sidebar: { ...prev.sidebar, visible: !prev.sidebar.visible, activeSection: 'search' } })),
      "view.toggleSourceControl": () => setIdeState(prev => ({ ...prev, sidebar: { ...prev.sidebar, visible: !prev.sidebar.visible, activeSection: 'git' } })),
      "git.commit": () => {},
      "theme.switchToDarkMode": () => useThemeStore.getState().setTheme("dark"),
      "theme.switchToLightMode": () => useThemeStore.getState().setTheme("light"),
    };

    commands.forEach(command => {
      registerCommand({ ...command, action: commandActions[command.id] });
    });
  }, [registerCommand, handleSave, setIdeState]);

  const theme = useThemeStore(state => state.theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // LSP Initialization
  useEffect(() => {
    if (id && token) {
      initLSP({
        workspaceId: id,
        token: token,
        onOpenFile: (fileName, line, column) => {
          const file = filesRef.current.find(f => f.name === fileName);
          if (file) {
            setActiveFileId(file.id);
            if (line && column) {
              setTimeout(() => {
                editorRef.current?.editor?.revealPosition({ lineNumber: line, column });
                editorRef.current?.editor?.setPosition({ lineNumber: line, column });
              }, 150);
            }
          }
        },
        onDiagnostics: (uri, lspDiagnostics) => {
          const workspacePrefix = 'file:///workspace/';
          if (!uri.startsWith(workspacePrefix)) return;
          const relativePath = uri.replace(workspacePrefix, '');
          const file = filesRef.current.find(f => f.name === relativePath);
          if (!file) return;

          const mappedDiagnostics: Diagnostic[] = lspDiagnostics.map((d: any) => ({
            id: `lsp-${file.id}-${d.range.start.line}-${d.range.start.character}-${Math.random().toString(36).slice(2, 7)}`,
            fileId: file.id,
            filePath: relativePath,
            fileName: relativePath,
            line: d.range.start.line + 1,
            column: d.range.start.character + 1,
            severity: d.severity === 1 ? 'error' : d.severity === 2 ? 'warning' : 'info',
            message: d.message,
            source: d.source || 'LSP'
          }));

          const currentDiagnostics = diagnosticsStore.getDiagnostics();
          const others = currentDiagnostics.filter(diag => diag.fileId !== file.id || (diag.source !== 'LSP' && diag.source !== 'typescript' && diag.source !== 'eslint'));
          diagnosticsStore.setDiagnostics([...others, ...mappedDiagnostics]);
        }
      }).catch(err => {
        console.error('LSP Init Error:', err);
      });
    }
  }, [id, token]); // Only init once per id/token change

  // Data Fetching (same as original)
  useEffect(() => {
    if (id) {
        setLoading(true);
        Promise.all([
            api.files.list(id),
            api.workspaces.activity(id),
            api.workspaces.get(id)
        ]).then(([fetchedFiles, fetchedActivity, fetchedWorkspace]) => {
            setFiles(fetchedFiles);
            setWorkspaceName(fetchedWorkspace.name);
            if (fetchedFiles.length > 0 && !activeFileId) {
                const savedActiveId = localStorage.getItem(`cc.activeFile.${id}`);
                if (savedActiveId && fetchedFiles.find(f => f.id === savedActiveId)) {
                  setActiveFileId(savedActiveId);
                } else {
                  setActiveFileId(fetchedFiles[0].id);
                }
            }
            
            const processedActivity = fetchedActivity.map((a: any) => {
                let actionText = a.actionType.replace(/_/g, ' ').toLowerCase();
                if (a.actionType === 'FILE_UPDATED') actionText = 'updated file';
                if (a.actionType === 'FILE_CREATED') actionText = 'created file';
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

  // File Content Loading
  useEffect(() => {
    if (activeFileId) {
        localStorage.setItem(`cc.activeFile.${id}`, activeFileId);
        const file = files.find(f => f.id === activeFileId);
        if (file && file.content === undefined) {
             api.files.get(activeFileId).then(fullFile => {
                 setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: fullFile.content } : f));
                 setCode(fullFile.content || "");
                 setLanguage(fullFile.language || "TypeScript");
             });
        } else if (file) {
            setCode(file.content || "");
            setLanguage(file.language || "TypeScript");
        }
    }
  }, [activeFileId, files]);



  // Handlers
  const handleTabClose = (fileId: string) => {
    setOpenFileIds(prev => {
      const next = prev.filter(id => id !== fileId);
      localStorage.setItem(`cc.openFiles.${id}`, JSON.stringify(next));
      
      if (activeFileId === fileId) {
        const lastFileId = next.length > 0 ? next[next.length - 1] : null;
        setActiveFileId(lastFileId);
      }
      return next;
    });
  };

  const handleCreateFile = async () => {
    if (!id || !newFileName) return;
    try {
        const newFile = await api.files.create(id, newFileName, "", "JavaScript");
        const fileWithCurrent = { ...newFile, currentContent: newFile.content || "" };
        setFiles(prev => [...prev, fileWithCurrent]);
        setActiveFileId(newFile.id);
        setCreateOpen(false);
        setNewFileName("");
        toast({ title: "Success", description: "File created" });
    } catch (err: any) {
        toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const handleRun = async () => {
    if (!activeFileId) return;
    setRunLoading(true);
    try {
      const result = await api.runner.runFile(activeFileId, language, runStdin);
      setRunHistory(prev => [
        { stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.exitCode, durationMs: result.durationMs, language, when: new Date().toLocaleTimeString() },
        ...prev
      ].slice(0, 20));

      diagnosticsStore.clearDiagnostics();
      if (result.stderr) {
        const newDiagnostics = parseDiagnostics(result.stderr, files);
        diagnosticsStore.addDiagnostics(newDiagnostics);
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Run failed", description: e.message });
    } finally {
      setRunLoading(false);
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
      if (!activeFileId || !id) return;
      const updatedFile = await api.files.restore(activeFileId, versionId);
      if (updatedFile && updatedFile.content) {
          setCode(updatedFile.content);
          setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: updatedFile.content, currentContent: updatedFile.content } : f));
          setSaveStatus("saved");
          setLastSavedAt(new Date());
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

  const handleProblemSelect = (problem: Diagnostic) => {
    if (problem.fileId !== activeFileId) {
      setActiveFileId(problem.fileId);
    }
    setTimeout(() => {
      if (editorRef.current?.editor) {
        editorRef.current.editor.revealPosition({
          lineNumber: problem.line,
          column: problem.column,
        });
        editorRef.current.editor.focus();
      }
    }, 150);
  };

  const handleSearchResultSelect = (fileId: string, match: SearchMatch) => {
    if (fileId !== activeFileId) {
      setActiveFileId(fileId);
    }
    setTimeout(() => {
      if (editorRef.current?.editor) {
        editorRef.current.editor.revealPosition({
          lineNumber: match.line,
          column: match.column,
        });
        editorRef.current.editor.focus();
      }
    }, 150);
  };

  // Set Monaco Markers
  useEffect(() => {
    const monaco = editorRef.current?.monaco;
    if (!monaco) return;

    const updateMarkers = () => {
      if (!activeFileId) return;
      const file = filesRef.current.find(f => f.id === activeFileId);
      if (!file) return;

      const model = monaco.editor.getModels().find(m => m.uri.toString() === `file:///workspace/${file.name}`);
      if (!model) return;

      const markers = diagnosticsStore.getDiagnostics()
        .filter(d => d.fileId === activeFileId)
        .map(toMonacoMarker);

      monaco.editor.setModelMarkers(model, 'owner', markers);
    };

    const unsubscribe = diagnosticsStore.subscribe(updateMarkers);
    updateMarkers(); // Initial update

    return () => {
      unsubscribe();
    };
  }, [activeFileId, editorRef.current?.monaco]);

  // Trigger Search
  const searchQuery = useSearchStore(state => state.query);
  const setSearchResults = useSearchStore(state => state.setResults);
  const setSearchLoading = useSearchStore(state => state.setLoading);

  useEffect(() => {
    if (searchQuery && id) {
      setSearchLoading(true);
      api.workspaces.search(id, searchQuery)
        .then(setSearchResults)
        .catch(err => {
          console.error(err);
          toast({ variant: "destructive", title: "Search Failed", description: "Could not perform search." });
        })
        .finally(() => setSearchLoading(false));
    } else if (!searchQuery) {
      setSearchResults([]);
    }
  }, [searchQuery, id]);

  // Git Status
  const { setStatus } = useGitStore();
  useEffect(() => {
    if (id) {
      api.git.status(id).then(response => {
        const status = response.status.split('\n').filter(Boolean).map(line => ({ path: line.slice(3), status: line.slice(0, 2).trim() }));
        setStatus(status);
      });
    }
  }, [id, setStatus]);

  const handleSave = async () => {
    if (activeFileId) {
      setSaveStatus("saving");
      try {
        await api.files.update(activeFileId, { content: code });
        setSaveStatus("saved");
        setLastSavedAt(new Date());
        // After save, the "original" content becomes the "current" content
        setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: code, currentContent: code } : f));
      } catch (err) {
        setSaveStatus("error");
        toast({ variant: "destructive", title: "Save Failed", description: "Your changes could not be saved." });
      }
    }
  };

  // Prepare Tabs for Layout
  const editorTabs: EditorTab[] = openFileIds.map(fid => {
    const f = files.find(file => file.id === fid);
    return {
      id: fid,
      name: f?.name || "Unknown",
      isDirty: fid === activeFileId ? isDirty : (f ? f.content !== (f as any).currentContent : false)
    };
  });

  const handleRenameFile = async (fileId: string, newName: string) => {
    try {
      await api.files.update(fileId, { name: newName });
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, name: newName } : f));
      toast({ title: "Success", description: "File renamed" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      await api.files.delete(fileId);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      handleTabClose(fileId);
      toast({ title: "Success", description: "File deleted" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const handleCreateFileInFolder = async (folder: string, fileName: string) => {
    if (!id) return;
    try {
      const fullPath = `${folder}/${fileName}`;
      const newFile = await api.files.create(id, fullPath, "", "JavaScript");
      const fileWithCurrent = { ...newFile, currentContent: newFile.content || "" };
      setFiles(prev => [...prev, fileWithCurrent]);
      setActiveFileId(newFile.id);
      toast({ title: "Success", description: "File created in folder" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const handleRenameFolder = async (oldPath: string, newName: string) => {
    toast({ title: "Note", description: "Folder renaming is partially supported in Phase 2" });
  };

  const getAIContext = () => {
    const editor = editorRef.current?.editor;
    const model = editor?.getModel();
    const selection = editor?.getSelection();
    
    return {
      fileName: files.find(f => f.id === activeFileId)?.name || 'unknown',
      language: language,
      selection: selection ? model?.getValueInRange(selection) : '',
      fullCode: model?.getValue() || '',
      problems: diagnosticsStore.getDiagnostics().filter(d => d.fileId === activeFileId),
      nearbyFiles: files.slice(0, 10).map(f => f.name)
    };
  };

  // Sync workspace context into AI store whenever workspace/files change
  const setWorkspaceContext = useAIStore(state => state.setWorkspaceContext);
  useEffect(() => {
    if (id && workspaceName) {
      setWorkspaceContext({
        workspaceId: id,
        workspaceName,
        fileList: files.map(f => f.name),
      });
    }
  }, [id, workspaceName, files, setWorkspaceContext]);

  // Insert text at a specific line in the editor (used by CodeReviewPanel)
  const handleInsertAtLine = (line: number, text: string) => {
    const editor = editorRef.current?.editor;
    const monaco = editorRef.current?.monaco;
    if (!editor || !monaco) return;

    // Clamp line to valid range
    const model = editor.getModel();
    const safeLineNumber = model ? Math.min(Math.max(1, line), model.getLineCount()) : line;
    const lineContent = model?.getLineContent(safeLineNumber) || '';
    const col = lineContent.length + 1;

    editor.executeEdits('ai-review', [{
      range: new (monaco.Range as any)(safeLineNumber, col, safeLineNumber, col),
      text: `\n// AI Suggestion:\n${text}`,
      forceMoveMarkers: true,
    }]);
    editor.revealLineInCenter(safeLineNumber);
    editor.focus();
  };

  // Collect bounded excerpts of related files (same folder, up to 4, first 80 lines each)
  // Used by MultiFileReviewPanel for cross-file review
  const getRelatedFiles = () => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (!activeFile) return [];
    const activeFolder = activeFile.name.includes('/') ? activeFile.name.split('/').slice(0, -1).join('/') : '';

    return files
      .filter(f => f.id !== activeFileId)
      .sort((a, b) => {
        // Prioritise same folder
        const aInFolder = activeFolder ? a.name.startsWith(activeFolder) : false;
        const bInFolder = activeFolder ? b.name.startsWith(activeFolder) : false;
        if (aInFolder && !bInFolder) return -1;
        if (!aInFolder && bInFolder) return 1;
        return 0;
      })
      .slice(0, 4)
      .map(f => ({
        name: f.name,
        language: f.name.split('.').pop() || 'text',
        excerpt: (f.content || '').split('\n').slice(0, 80).join('\n'),
      }));
  };


  const handleInsertAICode = (code: string) => {
    const editor = editorRef.current?.editor;
    if (!editor) return;
    
    const position = editor.getPosition();
    if (!position) return;

    editor.executeEdits('ai-assistant', [
      {
        range: new (editorRef.current?.monaco?.Range as any)(position.lineNumber, position.column, position.lineNumber, position.column),
        text: code,
        forceMoveMarkers: true
      }
    ]);
  };

  const handleReplaceAISelection = (code: string) => {
    const editor = editorRef.current?.editor;
    const selection = editor?.getSelection();
    if (!editor || !selection) return;

    editor.executeEdits('ai-assistant', [
      {
        range: selection,
        text: code,
        forceMoveMarkers: true
      }
    ]);
  };

  const handleDeleteFolder = async (folderPath: string) => {
    // This requires deleting all files that start with folderPath
    const filesInFolder = files.filter(f => f.name.startsWith(`${folderPath}/`));
    try {
      await Promise.all(filesInFolder.map(f => api.files.delete(f.id)));
      setFiles(prev => prev.filter(f => !f.name.startsWith(`${folderPath}/`)));
      filesInFolder.forEach(f => handleTabClose(f.id));
      toast({ title: "Success", description: "Folder deleted" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete some files in folder" });
    }
  };

  const getSidebarContent = (section: SidebarSection) => {
    switch (section) {
      case 'explorer':
        return (
          <SidePanel
            files={files.map(f => ({ id: f.id, name: f.name, active: f.id === activeFileId }))}
            participants={[]}
            activity={activity}
            activeFileId={activeFileId}
            onFileSelect={setActiveFileId}
            onFileCreate={() => setCreateOpen(true)}
            onFolderCreate={(name) => handleCreateFileInFolder(name, '.keep')}
            onCreateFileInFolder={handleCreateFileInFolder}
            onRenameFile={handleRenameFile}
            onDeleteFile={handleDeleteFile}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            width={undefined} // Layout controls width
            hideTabs={true}
            initialTab="files"
            awareness={provider?.awareness || null}
          />
        );
      case 'activity':
        return (
          <SidePanel
            files={files.map(f => ({ id: f.id, name: f.name, active: f.id === activeFileId }))}
            participants={[]}
            activity={activity}
            activeFileId={activeFileId}
            onFileSelect={setActiveFileId}
            width={undefined}
            hideTabs={true}
            initialTab="activity"
            awareness={provider?.awareness || null}
          />
        );
      case 'participants':
        return (
          <SidePanel
            files={files.map(f => ({ id: f.id, name: f.name, active: f.id === activeFileId }))}
            participants={[]}
            activity={activity}
            activeFileId={activeFileId}
            onFileSelect={setActiveFileId}
            width={undefined}
            hideTabs={true}
            initialTab="participants"
            awareness={provider?.awareness || null}
          />
        );
      case 'search':
        return <SearchPanel onResultSelect={handleSearchResultSelect} workspaceId={id || ""} />;
      case 'git':
        return <SourceControlPanel workspaceId={id || ""} />;
      case 'ai':
        return (
          <AIAssistantPanel 
            onInsertCode={handleInsertAICode}
            onReplaceSelection={handleReplaceAISelection}
            onInsertAtLine={handleInsertAtLine}
            getContext={getAIContext}
            getRelatedFiles={getRelatedFiles}
          />
        );
      default:
        return null;
    }
  };

  const getPanelContent = (tab: BottomTab) => {
    switch (tab) {
      case 'terminal':
        return <TerminalPanel workspaceId={id || "default"} terminalRef={terminalRef} />;
      case 'problems':
        return <ProblemsPanel onProblemSelect={handleProblemSelect} />;
      case 'output':
        return (
          <div className="flex flex-col h-full bg-black/40 text-white font-mono text-[11px] p-4 overflow-y-auto custom-scrollbar">
            {runHistory.map((run, i) => (
              <div key={i} className="mb-4 last:mb-0 border-l-2 border-primary/20 pl-3">
                <div className="text-muted-foreground mb-1">[{run.when}] {run.language} • exit {run.exitCode} in {run.durationMs}ms</div>
                {run.stdout && <pre className="text-emerald-400 whitespace-pre-wrap">{run.stdout}</pre>}
                {run.stderr && <pre className="text-rose-400 whitespace-pre-wrap">{run.stderr}</pre>}
              </div>
            ))}
            {runHistory.length === 0 && (
              <div className="text-muted-foreground italic">No execution history. Results from "Run Code" will appear here.</div>
            )}
          </div>
        );
      default:
        return (
          <div className="p-4 text-[11px] text-muted-foreground">
            No information to display in this tab.
          </div>
        );
    }
  };

  return (
    <WorkspaceIDELayout
      tabs={editorTabs}
      activeTabId={activeFileId}
      onTabSelect={setActiveFileId}
      onTabClose={handleTabClose}
      connectionStatus={connectionStatus}
      saveStatus={saveStatus}
      language={language}
      participantCount={provider?.awareness.getStates().size || 0}
      problemCount={diagnosticsStore.getDiagnostics().length}
      workspaceName={workspaceName}
      role="Owner"
      onClearTerminal={() => terminalRef.current?.clear()}
      sidebarContent={(section) => getSidebarContent(section)}
      panelContent={(tab) => getPanelContent(tab)}
      ideState={ideState}
      setIdeState={setIdeState}
    >
      <div className="flex flex-col h-full relative">
        <TopBar 
          workspaceId={id || ""}
          activeFile={files.find(f => f.id === activeFileId)?.name || "No file"}
          language={language}
          onLanguageChange={setLanguage}
          onRun={handleRun}
          onShare={() => setShareOpen(true)}
          onToggleSidebar={() => {}} // Handled by IDE layout
          sidebarOpen={true}
          saveStatus={saveStatus}
          lastSavedAt={lastSavedAt}
          onShowHistory={() => setHistoryOpen(true)}
          onExport={handleExport}
        />
        <div className="flex-1 relative">
          {activeFileId ? (
            <MonacoEditor
              ref={editorRef}
              fileId={activeFileId}
              fileName={files.find(f => f.id === activeFileId)?.name || ''}
              onSave={handleSave}
              readOnly={false}
              provider={provider}
              userName={user?.email || 'Anonymous'}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/5 opacity-50 select-none">
              <div className="text-4xl mb-4 font-bold tracking-tighter uppercase opacity-20">CollabCode</div>
              <p className="text-sm">Select a file to start coding</p>
              <div className="mt-8 flex flex-col gap-2 text-xs">
                <div className="flex items-center gap-4">
                  <span className="w-24 text-right">Create File</span>
                  <span className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono">Ctrl + N</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="w-24 text-right">Save File</span>
                  <span className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono">Ctrl + S</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="w-24 text-right">Search</span>
                  <span className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono">Ctrl + Shift + F</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ShareModal open={shareOpen} onOpenChange={setShareOpen} workspaceId={id || ""} />
      
      {activeFileId && (
        <VersionHistory
          fileId={activeFileId}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          onRestore={handleRestoreVersion}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create New File</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <Input 
              placeholder="filename.js" 
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFile()}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateFile}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      <CommandPalette open={isCommandPaletteOpen} onOpenChange={setIsCommandPaletteOpen} />
    </WorkspaceIDELayout>
  );
};

export default WorkspaceIDE;

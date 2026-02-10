import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import TopBar from "@/components/workspace/TopBar";
import SidePanel from "@/components/workspace/SidePanel";
import CodeEditor from "@/components/workspace/CodeEditor";
import StatusBar from "@/components/workspace/StatusBar";
import ShareModal from "@/components/workspace/ShareModal";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export type ConnectionStatus = "connected" | "reconnecting" | "offline";

interface File {
    id: string;
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

  // Create File State
  const [createOpen, setCreateOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");

  const MOCK_PARTICIPANTS = [
    { name: "You", status: "online" as const },
  ];

  // Fetch files
  useEffect(() => {
    if (id) {
        setLoading(true);
        api.files.list(id).then(fetchedFiles => {
            setFiles(fetchedFiles);
            if (fetchedFiles.length > 0) {
                setActiveFileId(fetchedFiles[0].id);
            }
        }).catch(err => {
            console.error(err);
            toast({ variant: "destructive", title: "Error", description: "Failed to load files" });
        }).finally(() => setLoading(false));
    }
  }, [id]);

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
                     setLanguage(fullFile.language);
                 }).catch(err => {
                     console.error(err);
                     toast({ variant: "destructive", title: "Error", description: "Failed to load file content" });
                 });
            } else {
                setCode(file.content);
                setLanguage(file.language);
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
                  // Optimistic update
                  setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: code } : f));
                  
                  api.files.update(activeFileId, { content: code }).catch(err => {
                      console.error("Auto-save failed", err);
                  });
              }
          }
      }, 1000);
      return () => clearTimeout(timeout);
  }, [code, activeFileId]);

  const handleCreateFile = async () => {
      if (!id || !newFileName) return;
      try {
          const newFile = await api.files.create(id, newFileName);
          setFiles(prev => [...prev, newFile]);
          setActiveFileId(newFile.id);
          setCreateOpen(false);
          setNewFileName("");
          toast({ title: "Success", description: "File created" });
      } catch (err: any) {
          toast({ variant: "destructive", title: "Error", description: err.message });
      }
  };

  const activeFileObj = files.find(f => f.id === activeFileId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar
        workspaceId={id || "unknown"}
        activeFile={activeFileObj?.name || "No file selected"}
        language={language}
        onLanguageChange={setLanguage}
        onShare={() => setShareOpen(true)}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        sidebarOpen={sidebarOpen}
      />

      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <SidePanel
            files={files.map(f => ({ id: f.id, name: f.name, active: f.id === activeFileId }))}
            participants={MOCK_PARTICIPANTS}
            activity={[]} 
            activeFileId={activeFileId}
            onFileSelect={setActiveFileId}
            onFileCreate={() => setCreateOpen(true)}
          />
        )}
        <CodeEditor
          code={code}
          onChange={setCode}
          collaborators={MOCK_PARTICIPANTS.filter(p => p.name !== "You")}
          connectionStatus={connectionStatus}
        />
      </div>

      <StatusBar
        connectionStatus={connectionStatus}
        language={language}
        cursorPosition={{ line: 1, col: 1 }} 
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
    </div>
  );
};

export default WorkspaceEditor;

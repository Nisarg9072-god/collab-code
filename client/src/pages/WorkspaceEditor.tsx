import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import TopBar from "@/components/workspace/TopBar";
import SidePanel from "@/components/workspace/SidePanel";
import CodeEditor from "@/components/workspace/CodeEditor";
import StatusBar from "@/components/workspace/StatusBar";
import ShareModal from "@/components/workspace/ShareModal";
import VersionHistory from "@/components/workspace/VersionHistory";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { FileText } from "lucide-react";

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

  // Version History & Auto-save State
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Activity State
  const [activity, setActivity] = useState<{ message: string; time: string }[]>([]);

  // Create File State
  const [createOpen, setCreateOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");

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
          const newFile = await api.files.create(id, newFileName);
          setFiles(prev => [...prev, newFile]);
          setActiveFileId(newFile.id);
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
        onLanguageChange={setLanguage}
        onShare={() => setShareOpen(true)}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        sidebarOpen={sidebarOpen}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        onShowHistory={() => activeFileId && setHistoryOpen(true)}
        onExport={handleExport}
      />

      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <SidePanel
            files={files.map(f => ({ id: f.id, name: f.name, active: f.id === activeFileId }))}
            participants={MOCK_PARTICIPANTS}
            activity={activity} 
            activeFileId={activeFileId}
            onFileSelect={setActiveFileId}
            onFileCreate={() => setCreateOpen(true)}
          />
        )}
        {files.length === 0 ? (
            <div className="flex flex-1 items-center justify-center flex-col gap-4 text-muted-foreground bg-[#1e1e1e]">
                <FileText className="h-12 w-12 opacity-20" />
                <p>No files in this workspace</p>
                <Button onClick={() => setCreateOpen(true)} variant="secondary">Create File</Button>
            </div>
        ) : !activeFileId ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground bg-[#1e1e1e]">
                <p>Select a file to edit</p>
            </div>
        ) : (
            <CodeEditor
              code={code}
              language={language}
              onChange={setCode}
              collaborators={MOCK_PARTICIPANTS.filter(p => p.name !== "You")}
              connectionStatus={connectionStatus}
            />
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
    </div>
  );
};

export default WorkspaceEditor;

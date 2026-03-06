import { useGitStore } from "@/features/git/gitStore";
import { GitStatusEntry } from "@/features/git/gitTypes";
import { Input } from "@/components/UI/input";
import { Button } from "@/components/UI/button";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/UI/dialog";
import { DiffViewer } from "./DiffViewer";
import { useState } from "react";
import { Sparkles, GitCommitHorizontal, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAIStore } from "@/features/ai/aiStore";
import { aiService } from "@/features/ai/aiService";

interface SourceControlPanelProps {
  workspaceId: string;
}

export const SourceControlPanel = ({ workspaceId }: SourceControlPanelProps) => {
  const { commitMessage, setCommitMessage, status, setStatus, loading, setLoading, diff, setDiff } = useGitStore();
  const { commitSuggestions, commitSuggestionsLoading, setCommitSuggestions, setCommitSuggestionsLoading, clearCommitSuggestions } = useAIStore();
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [log, setLog] = useState("");

  const handleFileClick = async (file: GitStatusEntry) => {
    setLoading(true);
    try {
      const diff = await api.git.diff(workspaceId, file.path);
      setDiff(diff);
      setIsDiffModalOpen(true);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Failed to get diff" });
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage || status.length === 0) return;

    setLoading(true);
    try {
      await api.git.add(workspaceId, status.map(s => s.path));
      await api.git.commit(workspaceId, commitMessage);
      setCommitMessage("");
      clearCommitSuggestions();
      const newStatus = await api.git.status(workspaceId);
      setStatus(newStatus.status.split('\n').filter(Boolean).map(line => ({ path: line.slice(3), status: line.slice(0, 2).trim() })));
      toast({ title: "Commit Successful" });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Commit Failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleShowLog = async () => {
    setLoading(true);
    try {
      const response = await api.git.log(workspaceId);
      setLog(response.log);
      setIsLogModalOpen(true);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Failed to get log" });
    } finally {
      setLoading(false);
    }
  };

  // AI: gather bounded diffs (up to 4 files, 50 lines each) then ask for suggestions
  const handleSuggestCommitMessage = async () => {
    if (status.length === 0) {
      toast({ title: "No changes", description: "Stage or modify files first." });
      return;
    }

    setCommitSuggestionsLoading(true);
    clearCommitSuggestions();

    try {
      // Fetch diffs for up to 4 files in parallel
      const filesToDiff = status.slice(0, 4);
      const diffParts = await Promise.allSettled(
        filesToDiff.map(f => api.git.diff(workspaceId, f.path))
      );

      // Build a bounded combined diff (~3000 chars max; the backend also truncates)
      let diffSummary = '';
      for (let i = 0; i < filesToDiff.length; i++) {
        const result = diffParts[i];
        if (result.status === 'fulfilled' && result.value?.diff) {
          const lines = result.value.diff.split('\n').slice(0, 50).join('\n');
          diffSummary += `\n--- ${filesToDiff[i].path} ---\n${lines}\n`;
        }
      }

      const changedFiles = status.map(s => `${s.status} ${s.path}`);
      const { suggestions, parseError } = await aiService.suggestCommitMessage(changedFiles, diffSummary);

      if (parseError && (!suggestions || suggestions.length === 0)) {
        toast({ variant: "destructive", title: "Couldn't parse suggestions", description: "AI returned an unexpected format." });
        return;
      }

      setCommitSuggestions(suggestions ?? []);
    } catch (err: any) {
      toast({ variant: "destructive", title: "AI Error", description: err.message });
    } finally {
      setCommitSuggestionsLoading(false);
    }
  };

  const handlePickSuggestion = (suggestion: string) => {
    setCommitMessage(suggestion);
    clearCommitSuggestions();
  };

  const statusLabel: Record<string, string> = {
    M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', '?': 'Untracked', '??': 'Untracked',
  };

  return (
    <div className="p-2 space-y-2">
      {/* Commit input + suggest button */}
      <div className="flex gap-1.5">
        <Input
          placeholder="Commit message…"
          value={commitMessage}
          onChange={(e) => {
            setCommitMessage(e.target.value);
            if (commitSuggestions.length > 0) clearCommitSuggestions();
          }}
          className="flex-1 text-xs h-8"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 gap-1 text-[10px] shrink-0 hover:border-primary hover:text-primary"
          onClick={handleSuggestCommitMessage}
          disabled={commitSuggestionsLoading || loading || status.length === 0}
          title="AI: generate commit message suggestions"
        >
          {commitSuggestionsLoading
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Sparkles className="h-3 w-3" />
          }
          {!commitSuggestionsLoading && "Suggest"}
        </Button>
      </div>

      {/* Suggestion chips */}
      {commitSuggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold px-0.5">
            ✨ AI Suggestions — click to use
          </p>
          {commitSuggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handlePickSuggestion(s)}
              className={cn(
                "w-full text-left text-[11px] leading-snug px-2.5 py-1.5 rounded-md border border-primary/30",
                "bg-primary/5 hover:bg-primary/15 hover:border-primary/60 transition-colors",
                "text-foreground cursor-pointer group"
              )}
            >
              <span className="inline-block text-primary/50 mr-1.5 text-[9px] uppercase font-bold group-hover:text-primary">
                #{i + 1}
              </span>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          onClick={handleCommit}
          disabled={!commitMessage || status.length === 0 || loading}
          className="flex-1 h-8 text-xs gap-1.5"
        >
          <GitCommitHorizontal className="h-3.5 w-3.5" />
          {loading ? "Committing…" : "Commit"}
        </Button>
        <Button onClick={handleShowLog} disabled={loading} variant="outline" className="h-8 text-xs">
          Log
        </Button>
      </div>

      {/* Changed files list */}
      {status.length === 0 && (
        <div className="py-6 text-center text-[11px] text-muted-foreground italic opacity-60">
          No changes detected.
        </div>
      )}
      <div className="space-y-0.5 mt-1">
        {status.map((file) => (
          <div
            key={file.path}
            className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer group"
            onClick={() => handleFileClick(file)}
          >
            <span className="text-[11px] truncate max-w-[75%] text-foreground/80 group-hover:text-foreground">
              {file.path}
            </span>
            <span className={cn(
              "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
              file.status === 'M'  ? "bg-yellow-500/15 text-yellow-400" :
              file.status === 'A'  ? "bg-green-500/15 text-green-400" :
              file.status === 'D'  ? "bg-red-500/15 text-red-400" :
              "bg-muted text-muted-foreground"
            )}>
              {statusLabel[file.status] ?? file.status}
            </span>
          </div>
        ))}
      </div>

      {/* Diff modal */}
      <Dialog open={isDiffModalOpen} onOpenChange={setIsDiffModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Diff</DialogTitle></DialogHeader>
          {diff && <DiffViewer diff={diff} />}
        </DialogContent>
      </Dialog>

      {/* Log modal */}
      <Dialog open={isLogModalOpen} onOpenChange={setIsLogModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Commit Log</DialogTitle></DialogHeader>
          <pre className="p-4 bg-muted rounded-md text-xs overflow-auto max-h-96">{log}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
};

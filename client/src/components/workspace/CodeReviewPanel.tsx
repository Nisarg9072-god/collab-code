import { useState } from "react";
import { ShieldCheck, AlertTriangle, AlertCircle, Info, Copy, CornerDownLeft, RefreshCw, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/UI/button";
import { cn } from "@/lib/utils";
import { useAIStore, ReviewIssue } from "@/features/ai/aiStore";
import { aiService } from "@/features/ai/aiService";
import { toast } from "@/hooks/use-toast";

interface CodeReviewPanelProps {
  getContext: () => any;
  onInsertAtLine?: (line: number, text: string) => void;
}

const severityConfig = {
  error: {
    icon: AlertCircle,
    label: "Error",
    badgeClass: "bg-red-500/15 text-red-400 border-red-500/30",
    dotClass: "bg-red-500",
    borderClass: "border-l-red-500/60",
  },
  warning: {
    icon: AlertTriangle,
    label: "Warning",
    badgeClass: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    dotClass: "bg-yellow-500",
    borderClass: "border-l-yellow-500/60",
  },
  info: {
    icon: Info,
    label: "Info",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    dotClass: "bg-blue-500",
    borderClass: "border-l-blue-500/40",
  },
};

function IssueCard({
  issue,
  onInsertAtLine,
}: {
  issue: ReviewIssue;
  onInsertAtLine?: (line: number, text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = severityConfig[issue.severity] ?? severityConfig.info;
  const Icon = cfg.icon;
  const hasFix = !!issue.fix?.trim();

  const handleCopyFix = () => {
    if (!hasFix) return;
    navigator.clipboard.writeText(issue.fix);
    toast({ title: "Fix copied to clipboard" });
  };

  const handleInsert = () => {
    if (!hasFix || !onInsertAtLine) return;
    onInsertAtLine(issue.line, issue.fix);
    toast({ title: `Fix inserted at line ${issue.line}` });
  };

  return (
    <div
      className={cn(
        "rounded-md border border-border border-l-2 bg-muted/20 transition-colors",
        cfg.borderClass
      )}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-2 p-2.5 text-left group"
      >
        <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", `text-${cfg.dotClass.replace('bg-','')}`)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border", cfg.badgeClass)}>
              {cfg.label}
            </span>
            {issue.line > 0 && (
              <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                L{issue.line}
              </span>
            )}
          </div>
          <p className="text-[11px] text-foreground leading-snug mt-1 pr-2">{issue.message}</p>
        </div>
        {hasFix && (
          expanded
            ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
        )}
      </button>

      {/* Expanded fix */}
      {hasFix && expanded && (
        <div className="px-2.5 pb-2.5">
          <div className="rounded bg-black/30 border border-white/10 p-2 mb-2">
            <pre className="text-[10px] font-mono text-green-300/90 whitespace-pre-wrap leading-relaxed overflow-x-auto">
              {issue.fix}
            </pre>
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[9px] px-2 gap-1 hover:bg-muted"
              onClick={handleCopyFix}
            >
              <Copy className="h-2.5 w-2.5" />
              Copy fix
            </Button>
            {onInsertAtLine && issue.line > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[9px] px-2 gap-1 hover:bg-primary/10 hover:text-primary"
                onClick={handleInsert}
              >
                <CornerDownLeft className="h-2.5 w-2.5" />
                Insert at L{issue.line}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getSummary(issues: ReviewIssue[]) {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const infos = issues.filter((i) => i.severity === 'info').length;
  return { errors, warnings, infos };
}

export function CodeReviewPanel({ getContext, onInsertAtLine }: CodeReviewPanelProps) {
  const { reviewResults, reviewLoading, reviewParseError, setReviewResults, setReviewLoading, clearReview, workspaceContext } =
    useAIStore();
  const [hasRun, setHasRun] = useState(false);

  const handleRunReview = async () => {
    const ctx = getContext();
    if (!ctx.fullCode?.trim()) {
      toast({ variant: "destructive", title: "Nothing to review", description: "Open a file with code first." });
      return;
    }

    clearReview();
    setReviewLoading(true);
    setHasRun(true);

    try {
      const { issues, parseError } = await aiService.review(
        ctx.fullCode,
        ctx.language || 'plaintext',
        ctx.fileName || 'untitled',
        workspaceContext?.workspaceId,
        workspaceContext?.fileList,
        workspaceContext?.workspaceName
      );
      setReviewResults(issues ?? [], parseError ?? null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Review failed", description: err.message });
      setReviewResults([], err.message);
    } finally {
      setReviewLoading(false);
    }
  };

  const { errors, warnings, infos } = getSummary(reviewResults);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-3 border-b border-border bg-muted/10 flex items-center justify-between shrink-0">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider">Code Review</span>
          <span className="text-[9px] text-muted-foreground mt-0.5">AI-powered issue detection</span>
        </div>
        <Button
          size="sm"
          className="h-7 text-[10px] gap-1.5 px-3"
          onClick={handleRunReview}
          disabled={reviewLoading}
        >
          <RefreshCw className={cn("h-3 w-3", reviewLoading && "animate-spin")} />
          {reviewLoading ? "Reviewing…" : "Run Review"}
        </Button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
        {/* Not yet run */}
        {!hasRun && !reviewLoading && (
          <div className="text-center py-10 text-muted-foreground">
            <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-xs font-medium">Ready to review</p>
            <p className="text-[10px] mt-1 italic opacity-60">Click "Run Review" to analyze the current file.</p>
          </div>
        )}

        {/* Loading */}
        {reviewLoading && (
          <div className="text-center py-10 text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-30 animate-pulse" />
            <p className="text-xs font-medium">Analyzing code…</p>
            <p className="text-[10px] mt-1 italic opacity-60">This may take a few seconds.</p>
          </div>
        )}

        {/* Parse error fallback */}
        {!reviewLoading && hasRun && reviewParseError && (
          <div className="space-y-2">
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
              <p className="text-[10px] font-semibold text-yellow-400 mb-1">Could not parse structured response</p>
              <p className="text-[10px] text-muted-foreground mb-2">The AI returned a raw response instead of JSON. Showing it below:</p>
              <pre className="text-[10px] font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed bg-black/20 rounded p-2 max-h-60 overflow-y-auto">
                {reviewParseError}
              </pre>
            </div>
          </div>
        )}

        {/* Clean bill of health */}
        {!reviewLoading && hasRun && !reviewParseError && reviewResults.length === 0 && (
          <div className="text-center py-10">
            <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-emerald-500/60" />
            <p className="text-sm font-semibold text-emerald-400">No issues found 🎉</p>
            <p className="text-[10px] mt-1 text-muted-foreground italic">Your code looks clean!</p>
          </div>
        )}

        {/* Summary bar */}
        {!reviewLoading && reviewResults.length > 0 && (
          <div className="flex items-center gap-3 py-2 px-3 rounded-md bg-muted/30 border border-border text-[10px] mb-1">
            {errors > 0 && <span className="text-red-400 font-semibold">{errors} error{errors > 1 ? 's' : ''}</span>}
            {warnings > 0 && <span className="text-yellow-400 font-semibold">{warnings} warning{warnings > 1 ? 's' : ''}</span>}
            {infos > 0 && <span className="text-blue-400 font-semibold">{infos} info</span>}
            <span className="ml-auto text-muted-foreground opacity-60">Click an issue to see the fix</span>
          </div>
        )}

        {/* Issue cards */}
        {!reviewLoading &&
          reviewResults.map((issue, i) => (
            <IssueCard key={i} issue={issue} onInsertAtLine={onInsertAtLine} />
          ))}
      </div>
    </div>
  );
}

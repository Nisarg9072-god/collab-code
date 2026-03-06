import { useState } from "react";
import {
  Layers, RefreshCw, Sparkles, Copy, AlertCircle, AlertTriangle, Info,
  ChevronDown, ChevronRight, BookOpen, Zap, ShieldAlert, Lightbulb,
  FileText, ArrowRight, Loader2
} from "lucide-react";
import { Button } from "@/components/UI/button";
import { cn } from "@/lib/utils";
import { useAIStore, MultiFileReviewResult, ProjectSummaryResult, CrossFileIssue } from "@/features/ai/aiStore";
import { aiService } from "@/features/ai/aiService";
import { toast } from "@/hooks/use-toast";

interface RelatedFile {
  name: string;
  language: string;
  excerpt: string;
}

interface MultiFileReviewPanelProps {
  getContext: () => any;
  getRelatedFiles: () => RelatedFile[];
}

// ── Severity config (shared look with CodeReviewPanel) ─────────────────────
const severityConfig = {
  error:   { icon: AlertCircle,  badge: "bg-red-500/15 text-red-400 border-red-500/30",    border: "border-l-red-500/60" },
  warning: { icon: AlertTriangle, badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", border: "border-l-yellow-500/60" },
  info:    { icon: Info,         badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",  border: "border-l-blue-500/40" },
};

// ── Single cross-file issue card ────────────────────────────────────────────
function CrossFileIssueCard({ issue }: { issue: CrossFileIssue }) {
  const [open, setOpen] = useState(false);
  const cfg = severityConfig[issue.severity] ?? severityConfig.info;
  const Icon = cfg.icon;
  return (
    <div className={cn("rounded-md border border-border border-l-2 bg-muted/20", cfg.border)}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-start gap-2 p-2.5 text-left">
        <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1 mb-1">
            <span className={cn("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border", cfg.badge)}>
              {issue.severity}
            </span>
            {(issue.files || []).map(f => (
              <span key={f} className="text-[9px] font-mono bg-muted border border-border px-1.5 py-0.5 rounded text-muted-foreground">
                {f.split('/').pop()}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-foreground leading-snug">{issue.message}</p>
        </div>
        {issue.suggestion && (open ? <ChevronDown className="h-3 w-3 shrink-0 mt-1 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 mt-1 text-muted-foreground" />)}
      </button>
      {open && issue.suggestion && (
        <div className="px-2.5 pb-2.5">
          <div className="rounded bg-black/30 border border-white/10 p-2">
            <p className="text-[10px] text-green-300/90 leading-relaxed">{issue.suggestion}</p>
          </div>
          <Button variant="ghost" size="sm" className="h-6 mt-1.5 text-[9px] px-2 gap-1"
            onClick={() => { navigator.clipboard.writeText(issue.suggestion); toast({ title: "Suggestion copied" }); }}>
            <Copy className="h-2.5 w-2.5" /> Copy
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Section heading ─────────────────────────────────────────────────────────
function SectionHead({ icon: Icon, label, count }: { icon: any; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-1.5 mt-3 mb-1.5">
      <Icon className="h-3.5 w-3.5 text-primary/60" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {count !== undefined && <span className="ml-auto text-[9px] text-muted-foreground">{count}</span>}
    </div>
  );
}

// ── Simple bullet list ──────────────────────────────────────────────────────
function BulletList({ items, color = "text-foreground/80" }: { items: string[]; color?: string }) {
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className={cn("flex items-start gap-1.5 text-[11px] leading-snug", color)}>
          <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-primary/40" />
          {item}
        </li>
      ))}
    </ul>
  );
}

// ── Multi-file review results ───────────────────────────────────────────────
function MultiReviewResults({ result, rawText }: { result: MultiFileReviewResult | null; rawText: string | null }) {
  if (rawText && !result) {
    return (
      <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
        <p className="text-[10px] font-semibold text-yellow-400 mb-1">Could not parse structured response</p>
        <pre className="text-[10px] text-foreground/70 whitespace-pre-wrap leading-relaxed bg-black/20 rounded p-2 max-h-48 overflow-y-auto">{rawText}</pre>
      </div>
    );
  }
  if (!result) return null;

  const copyAll = () => {
    const text = [
      `SUMMARY\n${result.summary}`,
      result.crossFileIssues.length ? `\nCROSS-FILE ISSUES\n${result.crossFileIssues.map(i => `[${i.severity.toUpperCase()}] ${i.files.join(', ')}: ${i.message}\n  → ${i.suggestion}`).join('\n')}` : '',
      result.architectureSuggestions.length ? `\nARCHITECTURE SUGGESTIONS\n${result.architectureSuggestions.map(s => `• ${s}`).join('\n')}` : '',
      result.integrationRisks.length ? `\nINTEGRATION RISKS\n${result.integrationRisks.map(r => `• ${r}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text);
    toast({ title: "Review copied to clipboard" });
  };

  return (
    <div className="space-y-1">
      {/* Summary */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[11px] leading-relaxed text-foreground/90 italic">{result.summary}</p>
        <Button variant="ghost" size="sm" className="h-6 text-[9px] px-2 gap-1 shrink-0" onClick={copyAll}>
          <Copy className="h-2.5 w-2.5" /> Copy
        </Button>
      </div>

      {/* Cross-file issues */}
      {result.crossFileIssues.length > 0 && (
        <>
          <SectionHead icon={AlertTriangle} label="Cross-File Issues" count={result.crossFileIssues.length} />
          <div className="space-y-1.5">
            {result.crossFileIssues.map((issue, i) => <CrossFileIssueCard key={i} issue={issue} />)}
          </div>
        </>
      )}

      {/* Architecture suggestions */}
      {result.architectureSuggestions.length > 0 && (
        <>
          <SectionHead icon={Lightbulb} label="Architecture Suggestions" count={result.architectureSuggestions.length} />
          <BulletList items={result.architectureSuggestions} color="text-blue-300/80" />
        </>
      )}

      {/* Integration risks */}
      {result.integrationRisks.length > 0 && (
        <>
          <SectionHead icon={ShieldAlert} label="Integration Risks" count={result.integrationRisks.length} />
          <BulletList items={result.integrationRisks} color="text-yellow-300/80" />
        </>
      )}

      {result.crossFileIssues.length === 0 && result.architectureSuggestions.length === 0 && result.integrationRisks.length === 0 && (
        <p className="text-center text-[11px] text-emerald-400 py-4">✓ No cross-file issues found 🎉</p>
      )}
    </div>
  );
}

// ── Project summary results ─────────────────────────────────────────────────
function ProjectSummaryResults({ summary, rawText }: { summary: ProjectSummaryResult | null; rawText: string | null }) {
  if (rawText && !summary) {
    return (
      <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
        <p className="text-[10px] font-semibold text-yellow-400 mb-1">Could not parse structured response</p>
        <pre className="text-[10px] text-foreground/70 whitespace-pre-wrap bg-black/20 rounded p-2 max-h-48 overflow-y-auto">{rawText}</pre>
      </div>
    );
  }
  if (!summary) return null;

  const copyAll = () => {
    const text = [
      `OVERVIEW\n${summary.overview}`,
      summary.mainFiles.length ? `\nKEY FILES\n${summary.mainFiles.map(f => `• ${f.file}: ${f.role}`).join('\n')}` : '',
      summary.keyFlows.length ? `\nKEY FLOWS\n${summary.keyFlows.map(f => `• ${f}`).join('\n')}` : '',
      summary.risks.length ? `\nRISKS\n${summary.risks.map(r => `• ${r}`).join('\n')}` : '',
      summary.nextSteps.length ? `\nNEXT STEPS\n${summary.nextSteps.map(s => `• ${s}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text);
    toast({ title: "Summary copied to clipboard" });
  };

  return (
    <div className="space-y-1">
      {/* Overview */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[11px] leading-relaxed text-foreground/90">{summary.overview}</p>
        <Button variant="ghost" size="sm" className="h-6 text-[9px] px-2 gap-1 shrink-0" onClick={copyAll}>
          <Copy className="h-2.5 w-2.5" /> Copy
        </Button>
      </div>

      {/* Main files */}
      {summary.mainFiles.length > 0 && (
        <>
          <SectionHead icon={FileText} label="Key Files" count={summary.mainFiles.length} />
          <div className="space-y-1">
            {summary.mainFiles.map((f, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md bg-muted/20 border border-border px-2 py-1.5">
                <span className="text-[10px] font-mono text-primary/70 shrink-0 min-w-0 truncate">{f.file.split('/').pop()}</span>
                <span className="text-[10px] text-muted-foreground flex-1">{f.role}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Key flows */}
      {summary.keyFlows.length > 0 && (
        <>
          <SectionHead icon={Zap} label="Key Flows" />
          <BulletList items={summary.keyFlows} color="text-purple-300/80" />
        </>
      )}

      {/* Risks */}
      {summary.risks.length > 0 && (
        <>
          <SectionHead icon={ShieldAlert} label="Risks" />
          <BulletList items={summary.risks} color="text-yellow-300/80" />
        </>
      )}

      {/* Next steps */}
      {summary.nextSteps.length > 0 && (
        <>
          <SectionHead icon={Lightbulb} label="Next Steps" />
          <BulletList items={summary.nextSteps} color="text-emerald-300/80" />
        </>
      )}
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────
type MultiMode = 'review' | 'summary';

export function MultiFileReviewPanel({ getContext, getRelatedFiles }: MultiFileReviewPanelProps) {
  const {
    multiReviewResult, multiReviewLoading, multiReviewParseError,
    setMultiReviewResult, setMultiReviewLoading, clearMultiReview,
    projectSummaryResult, projectSummaryLoading, projectSummaryParseError,
    setProjectSummaryResult, setProjectSummaryLoading, clearProjectSummary,
    workspaceContext,
  } = useAIStore();

  const [mode, setMode] = useState<MultiMode>('review');
  const [hasRunReview, setHasRunReview] = useState(false);
  const [hasRunSummary, setHasRunSummary] = useState(false);
  const [reviewedFiles, setReviewedFiles] = useState<string[]>([]);

  const handleRunMultiReview = async () => {
    const ctx = getContext();
    if (!ctx.fullCode?.trim()) {
      toast({ variant: "destructive", title: "No file open", description: "Open a file first." });
      return;
    }

    clearMultiReview();
    setMultiReviewLoading(true);
    setHasRunReview(true);

    const related = getRelatedFiles();
    setReviewedFiles([ctx.fileName, ...related.map(f => f.name)]);

    try {
      const { result, parseError } = await aiService.multiFileReview(
        { name: ctx.fileName, language: ctx.language, content: ctx.fullCode },
        related
      );
      setMultiReviewResult(result, parseError ?? null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Multi-review failed", description: err.message });
      setMultiReviewResult(null, err.message);
    } finally {
      setMultiReviewLoading(false);
    }
  };

  const handleRunSummary = async () => {
    if (!workspaceContext?.fileList?.length) {
      toast({ variant: "destructive", title: "No workspace context", description: "Open a workspace first." });
      return;
    }

    clearProjectSummary();
    setProjectSummaryLoading(true);
    setHasRunSummary(true);

    try {
      const ctx = getContext();
      const { summary, parseError } = await aiService.projectSummary(
        workspaceContext.workspaceName,
        workspaceContext.fileList,
        ctx.fileName || ''
      );
      setProjectSummaryResult(summary, parseError ?? null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Project summary failed", description: err.message });
      setProjectSummaryResult(null, err.message);
    } finally {
      setProjectSummaryLoading(false);
    }
  };

  const modeBtn = (m: MultiMode) => cn(
    "flex-1 flex items-center justify-center gap-1 py-1 text-[9px] font-bold uppercase tracking-wider rounded transition-colors",
    mode === m ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-2.5 border-b border-border bg-muted/10 shrink-0 space-y-2">
        {/* Mode mini-tabs */}
        <div className="flex gap-1.5 bg-muted/30 rounded-md p-1">
          <button className={modeBtn('review')} onClick={() => setMode('review')}>
            <Layers className="h-2.5 w-2.5" /> Multi-File Review
          </button>
          <button className={modeBtn('summary')} onClick={() => setMode('summary')}>
            <BookOpen className="h-2.5 w-2.5" /> Project Summary
          </button>
        </div>

        {/* Action button */}
        {mode === 'review' && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-muted-foreground truncate">
                {reviewedFiles.length > 0
                  ? `Reviewing: ${reviewedFiles.join(', ')}`
                  : 'Analyzes current file + nearby files'}
              </p>
            </div>
            <Button size="sm" className="h-7 text-[10px] gap-1.5 px-3 shrink-0" onClick={handleRunMultiReview} disabled={multiReviewLoading}>
              {multiReviewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {multiReviewLoading ? "Reviewing…" : "Review Related Files"}
            </Button>
          </div>
        )}
        {mode === 'summary' && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] text-muted-foreground flex-1">
              {workspaceContext ? `${workspaceContext.workspaceName} · ${workspaceContext.fileList.length} files` : 'Open a workspace first'}
            </p>
            <Button size="sm" className="h-7 text-[10px] gap-1.5 px-3 shrink-0" onClick={handleRunSummary} disabled={projectSummaryLoading}>
              {projectSummaryLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {projectSummaryLoading ? "Summarizing…" : "Summarize Project"}
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        {/* ── Review mode ── */}
        {mode === 'review' && (
          <>
            {!hasRunReview && !multiReviewLoading && (
              <div className="text-center py-10 text-muted-foreground">
                <Layers className="h-8 w-8 mx-auto mb-3 opacity-20" />
                <p className="text-xs font-medium">Multi-file review</p>
                <p className="text-[10px] mt-1 italic opacity-60">
                  Reviews your current file alongside up to 4 related files from the same folder.
                </p>
              </div>
            )}
            {multiReviewLoading && (
              <div className="text-center py-10 text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-30 animate-pulse" />
                <p className="text-xs font-medium">Analyzing files…</p>
                <p className="text-[10px] mt-1 italic opacity-60">Checking cross-file integration…</p>
              </div>
            )}
            {!multiReviewLoading && hasRunReview && (
              <MultiReviewResults result={multiReviewResult} rawText={multiReviewParseError} />
            )}
          </>
        )}

        {/* ── Summary mode ── */}
        {mode === 'summary' && (
          <>
            {!hasRunSummary && !projectSummaryLoading && (
              <div className="text-center py-10 text-muted-foreground">
                <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-20" />
                <p className="text-xs font-medium">Project summary</p>
                <p className="text-[10px] mt-1 italic opacity-60">
                  AI generates a readable overview of the project — architecture, key flows, risks, and next steps.
                </p>
              </div>
            )}
            {projectSummaryLoading && (
              <div className="text-center py-10 text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-30 animate-pulse" />
                <p className="text-xs font-medium">Summarizing project…</p>
                <p className="text-[10px] mt-1 italic opacity-60">This may take a moment.</p>
              </div>
            )}
            {!projectSummaryLoading && hasRunSummary && (
              <ProjectSummaryResults summary={projectSummaryResult} rawText={projectSummaryParseError} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

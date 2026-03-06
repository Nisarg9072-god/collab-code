
import { useState } from "react";
import { useSearchStore } from "@/features/search/searchStore";
import { SearchResult, SearchMatch } from "@/features/search/searchTypes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { File, Replace, Sparkles, Search, Loader2, Brain, FileSearch } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAIStore } from "@/features/ai/aiStore";
import { aiService } from "@/features/ai/aiService";

interface SearchPanelProps {
  onResultSelect: (fileId: string, match: SearchMatch) => void;
  workspaceId: string;
}

type SearchMode = 'exact' | 'ai';

export const SearchPanel = ({ onResultSelect, workspaceId }: SearchPanelProps) => {
  const { query, setQuery, replaceQuery, setReplaceQuery, results, loading, setResults } = useSearchStore();
  const { semanticResults, semanticLoading, semanticParseError, setSemanticResults, setSemanticLoading, clearSemanticResults, workspaceContext } = useAIStore();
  const [mode, setMode] = useState<SearchMode>('exact');
  const [aiQuery, setAiQuery] = useState('');

  // ── Exact search helpers (unchanged logic) ──────────────────────────────────
  const handleReplaceAll = async () => {
    if (!query || !replaceQuery || results.length === 0) return;
    try {
      await Promise.all(results.map(async (result) => {
        const file = await api.files.get(result.fileId);
        const originalContent = file.content || "";
        const newContent = originalContent.split(query).join(replaceQuery);
        if (originalContent !== newContent) {
          await api.files.update(result.fileId, { content: newContent });
        }
      }));
      toast({ title: "Replace Complete", description: `Replaced all instances of "${query}".` });
      setQuery("");
      setResults([]);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Replace Failed", description: "Could not replace all instances." });
    }
  };

  const handleReplaceSingle = async (fileId: string, match: SearchMatch) => {
    if (!query || !replaceQuery) return;
    try {
      const file = await api.files.get(fileId);
      const originalContent = file.content || "";
      const lines = originalContent.split('\n');
      const lineIndex = match.line - 1;
      if (lines[lineIndex]) {
        lines[lineIndex] = lines[lineIndex].replace(query, replaceQuery);
        const newContent = lines.join('\n');
        await api.files.update(fileId, { content: newContent });
        toast({ title: "Replace Successful", description: `Replaced in ${file.name}` });
        if (workspaceId) {
          const results = await api.workspaces.search(workspaceId, query);
          setResults(results);
        }
      }
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Replace Failed", description: "Could not replace match." });
    }
  };

  // ── Semantic search handler ─────────────────────────────────────────────────
  const handleSemanticSearch = async () => {
    const q = aiQuery.trim();
    if (!q) return;

    const fileList = workspaceContext?.fileList ?? [];
    if (fileList.length === 0) {
      toast({ title: "No file context", description: "Open a workspace first." });
      return;
    }

    clearSemanticResults();
    setSemanticLoading(true);

    try {
      const { matches, parseError } = await aiService.semanticSearch(
        q,
        fileList,
        workspaceId,
        workspaceContext?.workspaceName
      );
      setSemanticResults(matches ?? [], parseError ?? null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "AI Search Error", description: err.message });
      setSemanticResults([], err.message);
    } finally {
      setSemanticLoading(false);
    }
  };

  // Semantic result click → navigate to file (line 1 col 1)
  const handleSemanticResultClick = (fileName: string) => {
    const fileList = workspaceContext?.fileList ?? [];
    // We need the fileId — find it via workspaceContext file names mapping.
    // SearchPanel only gets onResultSelect(fileId, match). Since we don't have fileIds here,
    // we'll trigger the search results lookup to find the fileId by name.
    // Fallback: fire a normal exact search for the filename, then navigate.
    // Better: we'll pass a synthetic match with the file name so the parent can handle it.
    // The parent WorkspaceIDE listens to searchStore.query changes — so we fire a targeted search.
    setMode('exact');
    setQuery(fileName.split('/').pop() || fileName); // triggers WorkspaceIDE search effect
    toast({ title: "Navigating", description: `Opening files matching "${fileName}"` });
  };

  const modeButtonClass = (m: SearchMode) =>
    cn(
      "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
      mode === m
        ? "border-b-2 border-primary text-foreground bg-muted/20"
        : "text-muted-foreground hover:text-foreground hover:bg-muted/10"
    );

  return (
    <div className="flex flex-col h-full">
      {/* Mode Toggle */}
      <div className="flex border-b border-border shrink-0">
        <button className={modeButtonClass('exact')} onClick={() => setMode('exact')}>
          <Search className="h-3 w-3" />
          Exact
        </button>
        <button className={modeButtonClass('ai')} onClick={() => setMode('ai')}>
          <Brain className="h-3 w-3" />
          AI Search
        </button>
      </div>

      {/* ── EXACT SEARCH MODE ── */}
      {mode === 'exact' && (
        <div className="p-2 space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Replace"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
            />
            <Button size="icon" onClick={handleReplaceAll} disabled={!query || !replaceQuery || results.length === 0}>
              <Replace className="w-4 h-4" />
            </Button>
          </div>

          {loading && <div className="p-4 text-sm text-muted-foreground">Searching...</div>}

          {!loading && results.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              {query ? "No results found." : "Enter a search query to begin."}
            </div>
          )}

          {!loading && results.length > 0 && (
            <Accordion type="multiple" className="w-full">
              {results.map((result) => (
                <AccordionItem key={result.fileId} value={result.fileId}>
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <File className="w-4 h-4" />
                      <span className="font-medium">{result.fileName}</span>
                      <span className="text-xs text-muted-foreground">({result.matches.length})</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1">
                      {result.matches.map((match, index) => (
                        <div
                          key={index}
                          className="p-2 rounded-md hover:bg-muted cursor-pointer group flex items-start gap-2"
                          onClick={() => onResultSelect(result.fileId, match)}
                        >
                          <div className="flex-1">
                            <div className="text-xs text-muted-foreground">{match.line}:{match.column}</div>
                            <div
                              className="text-sm"
                              dangerouslySetInnerHTML={{
                                __html: match.preview.replace(
                                  new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                                  `<span class="bg-yellow-400 text-black">${query}</span>`
                                ),
                              }}
                            />
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReplaceSingle(result.fileId, match);
                            }}
                            disabled={!replaceQuery}
                            title="Replace this match"
                          >
                            <Replace className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      )}

      {/* ── AI SEMANTIC SEARCH MODE ── */}
      {mode === 'ai' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Input */}
          <div className="p-2 border-b border-border space-y-2 shrink-0">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
              Describe what you're looking for
            </p>
            <div className="flex gap-1.5">
              <Input
                placeholder='e.g. "where is login handled?"'
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSemanticSearch()}
                className="text-xs h-8 flex-1"
              />
              <Button
                size="sm"
                className="h-8 px-3 gap-1.5 text-[10px] shrink-0"
                onClick={handleSemanticSearch}
                disabled={semanticLoading || !aiQuery.trim()}
              >
                {semanticLoading
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Sparkles className="h-3 w-3" />
                }
                {semanticLoading ? "Searching…" : "Search"}
              </Button>
            </div>
            <p className="text-[9px] text-muted-foreground/50 italic">
              AI matches by intent, not exact text. Different from normal search.
            </p>
          </div>

          {/* Results area */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
            {/* Loading */}
            {semanticLoading && (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="h-6 w-6 mx-auto mb-2 animate-pulse opacity-40" />
                <p className="text-xs italic">Analyzing workspace…</p>
              </div>
            )}

            {/* Empty initial state */}
            {!semanticLoading && semanticResults.length === 0 && !semanticParseError && !aiQuery && (
              <div className="text-center py-8 text-muted-foreground">
                <Brain className="h-8 w-8 mx-auto mb-3 opacity-20" />
                <p className="text-xs font-medium">Ask anything about your codebase</p>
                <p className="text-[10px] mt-1 italic opacity-60">
                  "where is authentication handled?"<br />
                  "find API calls for user profile"<br />
                  "show files related to the database"
                </p>
              </div>
            )}

            {/* No matches */}
            {!semanticLoading && aiQuery && semanticResults.length === 0 && !semanticParseError && (
              <div className="text-center py-6 text-muted-foreground">
                <FileSearch className="h-6 w-6 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No relevant files found for this query.</p>
              </div>
            )}

            {/* Parse error fallback */}
            {!semanticLoading && semanticParseError && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
                <p className="text-[10px] font-semibold text-yellow-400 mb-1">Could not parse AI response</p>
                <pre className="text-[10px] text-foreground/70 whitespace-pre-wrap leading-relaxed bg-black/20 rounded p-2 max-h-40 overflow-y-auto">
                  {semanticParseError}
                </pre>
              </div>
            )}

            {/* Match cards */}
            {!semanticLoading && semanticResults.length > 0 && (
              <>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold px-0.5">
                  {semanticResults.length} relevant file{semanticResults.length !== 1 ? 's' : ''} found
                </p>
                {semanticResults.map((match, i) => (
                  <button
                    key={i}
                    onClick={() => handleSemanticResultClick(match.fileName)}
                    className={cn(
                      "w-full text-left rounded-md border border-border bg-muted/10 p-2.5",
                      "hover:bg-muted/30 hover:border-primary/40 transition-colors group"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <FileSearch className="h-3 w-3 text-primary/60 shrink-0" />
                      <span className="text-[11px] font-semibold text-foreground truncate">
                        {match.fileName}
                      </span>
                      <span className="text-[9px] text-primary/50 ml-auto shrink-0 font-bold">
                        #{i + 1}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">{match.reason}</p>
                    <p className="text-[9px] text-primary/50 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity italic">
                      Click to open →
                    </p>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchPanel;

import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Trash2, Code2, MessageSquare, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAIStore, AIAction, AIMessage } from "@/features/ai/aiStore";
import { aiService } from "@/features/ai/aiService";
import { toast } from "@/hooks/use-toast";
import { CodeReviewPanel } from "./CodeReviewPanel";
import { MultiFileReviewPanel } from "./MultiFileReviewPanel";

interface AIAssistantPanelProps {
  onInsertCode: (code: string) => void;
  onReplaceSelection: (code: string) => void;
  onInsertAtLine?: (line: number, text: string) => void;
  getContext: () => any;
  getRelatedFiles?: () => { name: string; language: string; excerpt: string }[];
}

type PanelTab = 'chat' | 'review' | 'multi';

// Render a message with code blocks styled distinctly from prose
function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-1.5">
      {parts.map((part, i) => {
        const codeMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
        if (codeMatch) {
          return (
            <pre
              key={i}
              className="mt-1 rounded bg-black/30 border border-white/10 p-2 text-[10px] leading-relaxed overflow-x-auto font-mono whitespace-pre"
            >
              <code>{codeMatch[2]}</code>
            </pre>
          );
        }
        return part ? (
          <span key={i} className="whitespace-pre-wrap leading-relaxed">{part}</span>
        ) : null;
      })}
    </div>
  );
}

// Extract first code block from AI markdown response
const extractCode = (text: string) => {
  const match = text.match(/```(?:\w+)?\n?([\s\S]*?)```/);
  return match ? match[1] : text;
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast({ title: "Copied to clipboard" });
};

export const AIAssistantPanel = ({
  onInsertCode,
  onReplaceSelection,
  onInsertAtLine,
  getContext,
  getRelatedFiles,
}: AIAssistantPanelProps) => {
  const { messages, loading, addMessage, setLoading, clearMessages, workspaceContext } = useAIStore();
  const [prompt, setPrompt] = useState("");
  const [panelTab, setPanelTab] = useState<PanelTab>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleAction = async (action: AIAction, customPrompt?: string) => {
    const context = getContext();
    const userPrompt = customPrompt || prompt;

    if (action === 'chat' && !userPrompt.trim()) return;

    setLoading(true);
    const userMsg: AIMessage = {
      role: 'user',
      content: userPrompt || action.charAt(0).toUpperCase() + action.slice(1),
      timestamp: new Date().toLocaleTimeString(),
    };
    addMessage(userMsg);

    try {
      const { response } = await aiService.ask(action, {
        ...context,
        userPrompt,
        // Thread workspace context into every ask
        workspaceId: workspaceContext?.workspaceId,
        workspaceName: workspaceContext?.workspaceName,
        fileList: workspaceContext?.fileList,
      });

      addMessage({
        role: 'assistant',
        content: response,
        timestamp: new Date().toLocaleTimeString(),
      });
      setPrompt("");
    } catch (err: any) {
      addMessage({
        role: 'assistant',
        content: `Error: ${err.message}. Please check your backend configuration and API keys.`,
        timestamp: new Date().toLocaleTimeString(),
      });
      toast({ variant: "destructive", title: "AI Error", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const quickActions: { label: string; action: AIAction }[] = [
    { label: "Explain", action: "explain" },
    { label: "Fix Errors", action: "fix" },
    { label: "Refactor", action: "refactor" },
    { label: "Gen Tests", action: "test" },
  ];

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wider">AI Assistant</span>
            {workspaceContext ? (
              <span className="text-[8px] text-primary/70 uppercase tracking-tighter truncate max-w-[140px]">
                {workspaceContext.workspaceName} · {workspaceContext.fileList.length} files
              </span>
            ) : (
              <span className="text-[8px] text-muted-foreground uppercase tracking-tighter">Gemini 1.5 Flash</span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearMessages} title="Clear Chat">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Tab bar: Chat / Review */}
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => setPanelTab('chat')}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
            panelTab === 'chat'
              ? "border-b-2 border-primary text-foreground bg-muted/20"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/10"
          )}
        >
          <MessageSquare className="h-3 w-3" />
          Chat
        </button>
        <button
          onClick={() => setPanelTab('review')}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
            panelTab === 'review'
              ? "border-b-2 border-primary text-foreground bg-muted/20"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/10"
          )}
        >
          <Code2 className="h-3 w-3" />
          Review
        </button>
        <button
          onClick={() => setPanelTab('multi')}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
            panelTab === 'multi'
              ? "border-b-2 border-primary text-foreground bg-muted/20"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/10"
          )}
        >
          <Layers className="h-3 w-3" />
          Multi
        </button>
      </div>

      {/* Multi-File Panel */}
      {panelTab === 'multi' && (
        <MultiFileReviewPanel
          getContext={getContext}
          getRelatedFiles={getRelatedFiles ?? (() => [])}
        />
      )}

      {/* Chat Panel */}
      {panelTab === 'chat' && (
        <>
          {/* Quick actions */}
          <div className="p-2 border-b border-border bg-muted/10 grid grid-cols-2 gap-1.5 shrink-0">
            {quickActions.map(({ label, action }) => (
              <Button
                key={action}
                variant="outline"
                size="sm"
                className="h-7 text-[10px] justify-start px-2"
                onClick={() => handleAction(action)}
                disabled={loading}
              >
                {label}
              </Button>
            ))}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 custom-scrollbar">
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-xs italic">Ask me to explain, fix, or generate code.</p>
                  {workspaceContext && (
                    <p className="text-[9px] mt-1 text-primary/50 italic">
                      Context: {workspaceContext.workspaceName}
                    </p>
                  )}
                </div>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex flex-col gap-1 max-w-[92%]",
                    msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div
                    className={cn(
                      "p-2.5 rounded-lg text-[11px]",
                      msg.role === 'user'
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-muted rounded-tl-none border border-border"
                    )}
                  >
                    <MessageContent content={msg.content} />

                    {msg.role === 'assistant' && msg.content.includes('```') && (
                      <div className="mt-2 flex gap-1.5 border-t border-border pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[9px] px-1.5"
                          onClick={() => onInsertCode(extractCode(msg.content))}
                        >
                          Insert
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[9px] px-1.5"
                          onClick={() => onReplaceSelection(extractCode(msg.content))}
                        >
                          Replace
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[9px] px-1.5"
                          onClick={() => copyToClipboard(extractCode(msg.content))}
                        >
                          Copy
                        </Button>
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] text-muted-foreground opacity-50 px-1">{msg.timestamp}</span>
                </div>
              ))}

              {loading && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border bg-muted/20 shrink-0">
            <div className="relative">
              <Input
                placeholder="Ask AI anything..."
                className="pr-10 text-[11px] h-9 bg-background focus-visible:ring-primary"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAction('chat')}
                disabled={loading}
              />
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1 h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                onClick={() => handleAction('chat')}
                disabled={loading || !prompt.trim()}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="mt-2 text-[9px] text-muted-foreground text-center italic opacity-60">
              AI can make mistakes. Always review code.
            </p>
          </div>
        </>
      )}

      {/* Review Panel */}
      {panelTab === 'review' && (
        <CodeReviewPanel
          getContext={getContext}
          onInsertAtLine={onInsertAtLine}
        />
      )}
    </div>
  );
};

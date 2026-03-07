import { useNavigate } from "react-router-dom";
import {
  Copy,
  Settings,
  Share2,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  Clock,
  Check,
  Cloud,
  AlertCircle,
  Download
} from "lucide-react";
import { Button } from "@/components/UI/button";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/UI/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/UI/tooltip";
import Logo from "@/components/Logo";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/UI/badge";

const LANGUAGES = ["TypeScript", "JavaScript", "Python", "Go", "Rust", "HTML", "CSS", "JSON", "Markdown", "SQL"];

interface TopBarProps {
  workspaceId: string;
  activeFile: string;
  language: string;
  onLanguageChange: (lang: string) => void;
  onRun?: () => void;
  onShare: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  saveStatus: "saved" | "saving" | "error";
  lastSavedAt: Date | null;
  onShowHistory: () => void;
  onExport: () => void;
}

const TopBar = ({
  workspaceId,
  activeFile,
  language,
  onLanguageChange,
  onRun,
  onShare,
  onToggleSidebar,
  sidebarOpen,
  saveStatus,
  lastSavedAt,
  onShowHistory,
  onExport
}: TopBarProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();

  const copyWorkspaceId = () => {
    navigator.clipboard.writeText(workspaceId);
    toast({ title: "Copied!", description: "Workspace ID copied to clipboard." });
  };

  return (
    <div className="flex h-11 items-center justify-between border-b border-border bg-card px-3">
      {/* Left */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleSidebar}>
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{sidebarOpen ? "Hide sidebar" : "Show sidebar"}</TooltipContent>
        </Tooltip>

        <Logo size="small" />

        <button
          onClick={copyWorkspaceId}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-mono text-muted-foreground hover:bg-muted transition-colors"
        >
          {workspaceId}
          <Copy className="h-3 w-3" />
        </button>

        {user?.plan === 'PRO' && (
          <Badge className="h-5 px-1.5 bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] uppercase font-bold tracking-wider">
            PRO
          </Badge>
        )}
      </div>

      {/* Center - Save Status */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground max-w-[30%] truncate">
        <span className="font-medium text-foreground truncate">{activeFile || "Select a file"}</span>
        {activeFile && (
          <div className="flex items-center gap-1.5 pl-2 border-l border-border/50 shrink-0">
            {saveStatus === "saving" && (
              <>
                <Cloud className="h-3 w-3 animate-pulse text-yellow-500" />
                <span>Saving...</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <Check className="h-3 w-3 text-green-500" />
                <span>Saved {lastSavedAt ? formatDistanceToNow(lastSavedAt, { addSuffix: true }) : ""}</span>
              </>
            )}
            {saveStatus === "error" && (
              <>
                <AlertCircle className="h-3 w-3 text-red-500" />
                <span className="text-red-500 text-[10px]">Save failed</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={onShowHistory} title="Version History">
          <Clock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">History</span>
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={onRun} title="Run Code">
          <span className="hidden sm:inline">Run</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground font-mono">
              {language}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {LANGUAGES.map((lang) => (
              <DropdownMenuItem key={lang} onClick={() => onLanguageChange(lang)}>
                {lang}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs hover:bg-primary/10 hover:text-primary transition-colors" onClick={onShare}>
          <Share2 className="h-3.5 w-3.5 text-primary" />
          Share
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive transition-colors ml-1"
              onClick={() => navigate("/")}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Leave workspace</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};

export default TopBar;

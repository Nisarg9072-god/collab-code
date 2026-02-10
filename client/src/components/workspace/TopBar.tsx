import { useNavigate } from "react-router-dom";
import {
  Copy,
  Settings,
  Share2,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Logo from "@/components/Logo";
import { useToast } from "@/hooks/use-toast";

const LANGUAGES = ["TypeScript", "JavaScript", "Python", "Go", "Rust", "HTML", "CSS", "JSON"];

interface TopBarProps {
  workspaceId: string;
  activeFile: string;
  language: string;
  onLanguageChange: (lang: string) => void;
  onShare: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

const TopBar = ({
  workspaceId,
  activeFile,
  language,
  onLanguageChange,
  onShare,
  onToggleSidebar,
  sidebarOpen,
}: TopBarProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

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
      </div>

      {/* Center */}
      <div className="flex items-center gap-2 text-sm text-foreground">
        <span className="font-medium">{activeFile}</span>
        <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Unsaved changes" />
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Settings className="h-4 w-4 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Editor settings</TooltipContent>
        </Tooltip>

        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onShare}>
          <Share2 className="h-3.5 w-3.5" />
          Share
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
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

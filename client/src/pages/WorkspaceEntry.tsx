import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ArrowRight, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Logo from "@/components/Logo";
import { useToast } from "@/hooks/use-toast";

const WorkspaceEntry = () => {
  const [workspaceId, setWorkspaceId] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleCreate = () => {
    navigate("/dashboard");
  };

  const handleJoin = () => {
    if (!workspaceId.trim()) {
      toast({ title: "Enter a workspace ID", description: "A valid workspace ID is required to join.", variant: "destructive" });
      return;
    }
    setIsJoining(true);
    setTimeout(() => {
      navigate(`/workspace/${workspaceId.trim()}`);
    }, 600);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4">
          <Logo size="default" />
          <p className="text-sm text-muted-foreground">
            Real-time collaborative code editing
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 space-y-6">
          <h1 className="text-xl font-semibold text-card-foreground">
            Open a Workspace
          </h1>

          <div className="space-y-2">
            <label htmlFor="workspace-id" className="text-sm font-medium text-foreground">
              Workspace ID
            </label>
            <Input
              id="workspace-id"
              placeholder="e.g. a1b2c3d4"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              className="font-mono bg-muted border-border"
            />
            <p className="text-xs text-muted-foreground">Provided by your team</p>
          </div>

          <div className="flex flex-col gap-3">
            <Button onClick={handleCreate} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Create new workspace
            </Button>
            <Button
              variant="secondary"
              onClick={handleJoin}
              disabled={isJoining}
              className="w-full gap-2"
            >
              {isJoining ? (
                <span className="animate-pulse-subtle">Joining…</span>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4" />
                  Join existing workspace
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wifi className="h-3.5 w-3.5" />
            <span>No sign-in required</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceEntry;

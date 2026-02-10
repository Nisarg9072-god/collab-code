import { Copy, Link, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

const ShareModal = ({ open, onOpenChange, workspaceId }: ShareModalProps) => {
  const { toast } = useToast();
  const inviteLink = `${window.location.origin}/workspace/${workspaceId}`;

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard.` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Workspace</DialogTitle>
          <DialogDescription>
            Invite others to collaborate in this workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Workspace ID</label>
            <div className="flex gap-2">
              <Input value={workspaceId} readOnly className="font-mono bg-muted" />
              <Button variant="secondary" size="icon" onClick={() => copyText(workspaceId, "Workspace ID")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Invite Link</label>
            <div className="flex gap-2">
              <Input value={inviteLink} readOnly className="text-xs bg-muted" />
              <Button variant="secondary" size="icon" onClick={() => copyText(inviteLink, "Invite link")}>
                <Link className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Anyone with this link can view and edit code in this workspace. Do not share publicly if the workspace contains sensitive content.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareModal;

import { Copy, Link, ShieldAlert, UserPlus, X, Shield, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/UI/button";
import { Input } from "@/components/UI/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/UI/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/UI/avatar";
import { Badge } from "@/components/UI/badge";

interface Member {
  userId: string;
  email: string;
  displayName?: string;
  role: string;
}

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  currentUserId?: string;
}

const ShareModal = ({ open, onOpenChange, workspaceId, currentUserId }: ShareModalProps) => {
  const { toast } = useToast();
  const inviteLink = `${window.location.origin}/workspace/${workspaceId}`;
  const [invitee, setInvitee] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);

  const fetchMembers = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const ws = await api.workspaces.get(workspaceId);
      setMembers(ws.members || []);
    } catch {
      toast({ variant: "destructive", title: "Could not load members" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchMembers();
  }, [open, workspaceId]);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard.` });
  };

  const handleInvite = async () => {
    if (!invitee.trim()) return;
    setInviting(true);
    try {
      await api.workspaces.invite(workspaceId, invitee.trim());
      toast({ title: "Invite sent", description: "Your invitation has been sent." });
      setInvitee("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Invite failed", description: e?.message });
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await api.workspaces.removeMember(workspaceId, userId);
      setMembers(prev => prev.filter(m => m.userId !== userId));
      toast({ title: "Member removed" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not remove member", description: e?.message });
    }
  };

  const isOwner = members.find(m => m.userId === currentUserId)?.role === 'OWNER';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Share Workspace
          </DialogTitle>
          <DialogDescription>
            Invite others or manage existing members.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Invite Section */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invite by Email</label>
            <div className="flex gap-2">
              <Input
                placeholder="name@example.com"
                value={invitee}
                className="bg-muted focus:bg-background transition-colors"
                onChange={(e) => setInvitee(e.target.value)} />
              <Button onClick={handleInvite} disabled={inviting}>
                {inviting ? "Sending..." : "Invite"}
              </Button>
            </div>
          </div>

          {/* Members List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workspace Members ({members.length})</label>
              {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>

            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
              {members.map(member => (
                <div key={member.userId} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-transparent hover:border-border transition-all">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${member.email}`} />
                      <AvatarFallback>{member.email.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{member.displayName || member.email}</p>
                      <div className="flex items-center gap-1">
                        {member.role === 'OWNER' ? <ShieldCheck className="h-3 w-3 text-amber-500" /> : <Shield className="h-3 w-3 text-muted-foreground" />}
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">{member.role}</span>
                      </div>
                    </div>
                  </div>

                  {isOwner && member.userId !== currentUserId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveMember(member.userId)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {members.length === 0 && !loading && (
                <p className="text-sm text-center py-4 text-muted-foreground italic">No members found.</p>
              )}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">General Access</label>
              <div className="flex gap-2 items-center p-2 rounded-md bg-muted/50">
                <Input value={inviteLink} readOnly className="text-xs bg-transparent border-none shadow-none focus-visible:ring-0 h-auto p-0 truncate" />
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs font-medium shrink-0" onClick={() => copyText(inviteLink, "Invite link")}>
                  <Link className="h-3.5 w-3.5" />
                  Copy Link
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-teal-500/20 bg-teal-500/5 p-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-500" />
              <p className="text-[11px] text-teal-600 dark:text-teal-400">
                Workspace members can edit code and manage files. Securely share the link with trusted collaborators.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareModal;

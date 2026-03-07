import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/UI/button";
import { Input } from "@/components/UI/input";
import { Textarea } from "@/components/UI/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/UI/dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/UI/card";
import { Badge } from "@/components/UI/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/UI/avatar";
import {
  Plus, Users, ArrowRight, Loader2, LayoutGrid, LogOut, Clock, DoorOpen,
  Search, Bell, Sun, Moon, Check, X, Mail, RefreshCw, Copy, Command, Star
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { formatDistanceToNow } from "date-fns";

interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  ownerId: string;
  members?: Array<{ userId: string; role: string }>;
}

interface Invitation {
  id: string;
  workspaceId: string;
  role: string;
  status: string;
  createdAt: string;
  workspace: { id: string; name: string };
  invitedBy: { id: string; email: string; displayName?: string };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost" size="icon"
      className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text).catch(() => { }); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
    >
      {copied ? <Check className="h-3 w-3 text-teal-400" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);

  // Create workspace
  const [createOpen, setCreateOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [creating, setCreating] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Join by ID — now request-based
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinWorkspaceId, setJoinWorkspaceId] = useState("");
  const [joinMessage, setJoinMessage] = useState("");
  const [joining, setJoining] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchWorkspaces = useCallback(async () => {
    try {
      const data = await api.workspaces.list();
      setWorkspaces(data ?? []);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to load workspaces" });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInvitations = useCallback(async () => {
    setLoadingInvites(true);
    try {
      const data = await api.invitations.list();
      setInvitations(data ?? []);
    } catch { /* silent — user might not be logged in yet */ }
    finally { setLoadingInvites(false); }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
    fetchInvitations();
  }, [fetchWorkspaces, fetchInvitations]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    // Allow creation regardless of initial plan check.
    // Usage limits will be enforced inside the workspace itself.
    setCreating(true);
    try {
      const workspace = await api.workspaces.create(newWorkspaceName);
      setWorkspaces(prev => [workspace, ...prev]);
      setCreateOpen(false);
      setNewWorkspaceName("");
      toast({ title: "Workspace created!" });
      navigate(`/workspace/${workspace.id}`);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to create workspace" });
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinWorkspaceId.trim()) return;
    setJoining(true);
    try {
      const result = await api.joinRequests.request(joinWorkspaceId.trim(), joinMessage.trim() || undefined);

      if (result?.alreadyMember) {
        toast({ title: "Already a member", description: "Navigating to workspace…" });
        navigate(`/workspace/${joinWorkspaceId.trim()}`);
      } else {
        toast({ title: "Request Sent! 🎉", description: result?.message || "Your request has been sent to the workspace owner." });
      }
      setJoinOpen(false);
      setJoinWorkspaceId("");
      setJoinMessage("");
      if (result?.alreadyMember) fetchWorkspaces();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Request Failed", description: error.message || "Failed to send join request" });
    } finally {
      setJoining(false);
    }
  };

  const handleAcceptInvitation = async (inviteId: string, workspaceId: string, workspaceName: string) => {
    setProcessingInvite(inviteId);
    try {
      const res = await api.invitations.accept(inviteId);
      toast({ title: "✅ Invitation Accepted", description: `Welcome to "${workspaceName}"!` });
      setInvitations(prev => prev.filter(i => i.id !== inviteId));
      await fetchWorkspaces();
      navigate(`/workspace/${workspaceId}`);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to accept invitation" });
    } finally {
      setProcessingInvite(null);
    }
  };

  const handleRejectInvitation = async (inviteId: string) => {
    setProcessingInvite(inviteId);
    try {
      await api.invitations.reject(inviteId);
      toast({ title: "Invitation rejected" });
      setInvitations(prev => prev.filter(i => i.id !== inviteId));
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to reject invitation" });
    } finally {
      setProcessingInvite(null);
    }
  };

  const handleLogout = () => { logout(); navigate("/"); };

  const filteredWorkspaces = workspaces.filter(w =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade required</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Upgrade your plan to create a workspace.</p>
          <div className="pt-2">
            <Button onClick={() => navigate("/pricing")}>Upgrade</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="min-h-screen bg-background text-foreground flex flex-col">
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/80 backdrop-blur-md">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-8">
              <a className="flex items-center space-x-2" href="/">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <LayoutGrid className="h-5 w-5 text-primary" />
                </div>
                <span className="hidden font-bold sm:inline-block text-lg tracking-tight">CollabCode</span>
              </a>
            </div>

            {/* Search */}
            <div className="hidden md:flex flex-1 items-center justify-center max-w-md relative">
              <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search workspaces…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-10 pl-10 w-full bg-muted/50 border-transparent focus:bg-background focus:border-primary/50 transition-all"
              />
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" title="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>

              {/* Notification bell with invite badge */}
              <div className="relative">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={fetchInvitations}>
                  <Bell className="h-5 w-5" />
                </Button>
                {invitations.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-teal-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {invitations.length}
                  </span>
                )}
              </div>

              <div className="h-6 w-px bg-white/10" />

              <div className="flex items-center gap-3">
                <div className="hidden md:block text-right">
                  <div className="flex items-center justify-end gap-2">
                    <p className="text-sm font-medium">{user?.displayName || user?.name || "User"}</p>
                    <Badge variant={user?.plan === 'PRO' ? 'default' : 'secondary'} className={user?.plan === 'PRO' ? 'bg-amber-500/20 text-amber-500 border-amber-500/30' : 'bg-muted/50 text-muted-foreground'}>
                      {user?.plan || 'FREE'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <Avatar className="h-9 w-9 border border-white/10 cursor-pointer" onClick={() => navigate("/pricing")}>
                  <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.email}`} />
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">
                    {user?.email?.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout" className="hover:bg-red-500/10 hover:text-red-500">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* ── Main Content ───────────────────────────────────────────────── */}
            <div className="lg:col-span-8 space-y-8">

              {/* Invitations Panel */}
              {invitations.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold flex items-center gap-2">
                      <Mail className="h-4 w-4 text-teal-500" />
                      Pending Invitations
                      <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/30">{invitations.length}</Badge>
                    </h2>
                    <Button variant="ghost" size="sm" onClick={fetchInvitations} className="text-muted-foreground hover:text-foreground">
                      <RefreshCw className={`h-3.5 w-3.5 ${loadingInvites ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                  {invitations.map(inv => (
                    <Card key={inv.id} className="bg-card/80 border-teal-500/20 backdrop-blur-sm">
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
                            <Mail className="h-5 w-5 text-teal-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              <strong>{inv.invitedBy.displayName || inv.invitedBy.email}</strong> invited you to{" "}
                              <strong>{inv.workspace.name}</strong>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Role: <span className="text-teal-400 font-medium">{inv.role}</span>
                              {" · "}
                              {new Date(inv.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            className="bg-teal-500 hover:bg-teal-600 text-white"
                            disabled={processingInvite === inv.id}
                            onClick={() => handleAcceptInvitation(inv.id, inv.workspaceId, inv.workspace.name)}
                          >
                            {processingInvite === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="mr-1 h-3.5 w-3.5" />Accept</>}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                            disabled={processingInvite === inv.id}
                            onClick={() => handleRejectInvitation(inv.id)}
                          >
                            <X className="mr-1 h-3.5 w-3.5" />Reject
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Welcome + Action buttons */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-br from-primary/5 via-primary/5 to-transparent p-6 rounded-2xl border border-primary/10">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight mb-1">
                    Welcome back, {user?.displayName || user?.name?.split(" ")[0] || "Developer"} 👋
                  </h1>
                  <p className="text-muted-foreground text-sm">{workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}. What are you building today?</p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Join by ID — request-based */}
                  <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="gap-2 h-10 border-primary/20 hover:bg-primary/5">
                        <DoorOpen className="h-4 w-4" />Join with ID
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-background/95 backdrop-blur-2xl border-border">
                      <DialogHeader>
                        <DialogTitle>Request Access to Workspace</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleJoinRequest} className="space-y-4 py-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Workspace ID</label>
                          <Input
                            placeholder="Paste workspace ID (UUID format)…"
                            value={joinWorkspaceId}
                            onChange={e => setJoinWorkspaceId(e.target.value)}
                            required
                          />
                          <p className="text-xs text-muted-foreground">You can find the ID in the workspace header or settings tab.</p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Message (optional)</label>
                          <Textarea
                            placeholder="Hi, I'd like to collaborate on…"
                            value={joinMessage}
                            onChange={e => setJoinMessage(e.target.value)}
                            rows={3}
                            className="resize-none"
                          />
                        </div>
                        <Button type="submit" className="w-full" disabled={joining}>
                          {joining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DoorOpen className="mr-2 h-4 w-4" />}
                          Send Access Request
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>

                  {/* Create workspace */}
                  <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogTrigger asChild>
                      <Button className="gap-2 h-10 shadow-lg shadow-primary/20">
                        <Plus className="h-4 w-4" />New Workspace
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-background/95 backdrop-blur-2xl border-border">
                      <DialogHeader><DialogTitle>Create New Workspace</DialogTitle></DialogHeader>
                      <form onSubmit={handleCreateWorkspace} className="space-y-4 py-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Workspace Name</label>
                          <Input
                            placeholder="e.g. My Awesome Project"
                            value={newWorkspaceName}
                            onChange={e => setNewWorkspaceName(e.target.value)}
                            required
                          />
                        </div>
                        <Button type="submit" className="w-full" disabled={creating}>
                          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Create Workspace"}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* Workspaces list */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4 text-primary" />Your Workspaces
                  </h2>
                </div>

                {filteredWorkspaces.length === 0 ? (
                  <Card className="border-dashed bg-muted/20">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="rounded-full bg-background p-4 mb-4 border shadow-sm">
                        <LayoutGrid className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-medium">
                        {searchQuery ? "No workspaces match your search" : "No workspaces yet"}
                      </h3>
                      <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-6">
                        {searchQuery ? "Try adjusting your search." : "Create a workspace or request access to an existing one."}
                      </p>
                      {!searchQuery && (
                        <Button onClick={() => setCreateOpen(true)} variant="outline">Create Workspace</Button>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredWorkspaces.map(workspace => (
                      <Card
                        key={workspace.id}
                        className="group cursor-pointer hover:border-primary/50 transition-all hover:shadow-md bg-card/50 backdrop-blur-sm border-white/5"
                        onClick={() => navigate(`/workspace/${workspace.id}`)}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1 min-w-0">
                              <CardTitle className="text-base font-medium group-hover:text-primary transition-colors">
                                {workspace.name}
                              </CardTitle>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                                <span>ID: {workspace.id.substring(0, 12)}…</span>
                                <CopyButton text={workspace.id} />
                              </div>
                            </div>
                            <div className="flex -space-x-2 shrink-0">
                              {(workspace.members ?? []).slice(0, 3).map((member, i) => (
                                <Avatar key={i} className="h-6 w-6 border-2 border-background">
                                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                    {member.role[0]}
                                  </AvatarFallback>
                                </Avatar>
                              ))}
                              {(workspace.members?.length ?? 0) > 3 && (
                                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] border-2 border-background font-medium text-muted-foreground">
                                  +{(workspace.members?.length ?? 0) - 3}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{workspace.updatedAt
                                  ? new Date(workspace.updatedAt).toLocaleDateString()
                                  : new Date(workspace.createdAt).toLocaleDateString()}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span>{workspace.members?.length ?? 0}</span>
                              </div>
                            </div>
                            <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Sidebar ─────────────────────────────────────────────────────── */}
            <div className="lg:col-span-4 space-y-6">
              {/* Active Plan Card */}
              <Card className="bg-card/50 backdrop-blur-sm border-white/5 overflow-hidden">
                <div className={`h-1 w-full bg-gradient-to-r ${user?.plan === 'PRO' ? 'from-amber-500 to-orange-500' : 'from-primary to-blue-500'}`} />
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Active Plan</CardTitle>
                  <Star className={`h-4 w-4 ${user?.plan === 'PRO' ? 'text-amber-500 fill-amber-500' : 'text-primary'}`} />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold tracking-tight">{user?.plan || 'FREE'}</span>
                    <span className="text-xs text-muted-foreground">Project Plan</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Daily Usage</span>
                      <span className="font-medium text-foreground">{user?.plan === 'PRO' ? 'No Limit' : '2 Hours'}</span>
                    </div>
                    {user?.plan !== 'PRO' && (
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: '0%' }} />
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Plan Expiry</span>
                      <span className="font-medium text-foreground">
                        {user?.planExpiry ? new Date(user?.planExpiry).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  </div>

                  {user?.plan !== 'PRO' ? (
                    <Button size="sm" className="w-full bg-primary/10 text-primary hover:bg-primary/20 border-primary/20" onClick={() => navigate("/pricing")}>
                      Upgrade to PRO
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="w-full border-amber-500/20 text-amber-500 hover:bg-amber-500/10" onClick={() => navigate("/pricing")}>
                      Manage Subscription
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Invitations panel (if any) */}
              {invitations.length === 0 ? (
                <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/20 overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                  <CardContent className="p-6 space-y-4 relative z-10">
                    <div className="flex items-center gap-2 text-primary font-semibold">
                      <Mail className="h-4 w-4" />
                      <span>No Invitations</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      When someone invites you to a workspace, it will appear here. You can also join using a Workspace ID.
                    </p>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => setJoinOpen(true)}>
                      <DoorOpen className="mr-2 h-3.5 w-3.5" /> Join with Workspace ID
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-card/50 backdrop-blur-sm border-teal-500/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-teal-400 uppercase tracking-wider flex items-center gap-2">
                      <Mail className="h-3 w-3" />
                      Invitations ({invitations.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {invitations.slice(0, 3).map(inv => (
                      <div key={inv.id} className="flex items-center justify-between gap-2 py-2 border-b border-white/5 last:border-0">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{inv.workspace.name}</p>
                          <p className="text-xs text-muted-foreground">as {inv.role}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="icon"
                            className="h-7 w-7 bg-teal-500/20 hover:bg-teal-500 text-teal-400 hover:text-white"
                            disabled={processingInvite === inv.id}
                            onClick={() => handleAcceptInvitation(inv.id, inv.workspaceId, inv.workspace.name)}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-red-400"
                            disabled={processingInvite === inv.id}
                            onClick={() => handleRejectInvitation(inv.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {invitations.length > 3 && (
                      <p className="text-xs text-muted-foreground text-center">+{invitations.length - 3} more above</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Quick Stats */}
              <Card className="bg-card/50 backdrop-blur-sm border-white/5">
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">{workspaces.length}</p>
                      <p className="text-xs text-muted-foreground">Workspaces</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-teal-400">{invitations.length}</p>
                      <p className="text-xs text-muted-foreground">Invitations</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        </main>
      </div>
    </>
  );
}

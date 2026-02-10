import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus, Users, ArrowRight, Loader2, Copy, Check, LayoutGrid, Settings, LogOut, Clock, Link as LinkIcon, DoorOpen } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  members: Array<{ userId: string; role: string }>;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [creating, setCreating] = useState(false);

  // Join Modal State
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinWorkspaceId, setJoinWorkspaceId] = useState("");
  const [joining, setJoining] = useState(false);

  // Invite Modal State
  const [inviteOpen, setInviteOpen] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const fetchWorkspaces = async () => {
    try {
      const data = await api.workspaces.list();
      setWorkspaces(data);
    } catch (error) {
      console.error("Failed to fetch workspaces:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load workspaces",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    setCreating(true);
    try {
      const workspace = await api.workspaces.create(newWorkspaceName);
      setWorkspaces([workspace, ...workspaces]);
      setCreateOpen(false);
      setNewWorkspaceName("");
      toast({
        title: "Success",
        description: "Workspace created successfully",
      });
      navigate(`/workspace/${workspace.id}`);
    } catch (error) {
      console.error("Failed to create workspace:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create workspace",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleJoinWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinWorkspaceId.trim()) return;

    setJoining(true);
    try {
      const result = await api.workspaces.join(joinWorkspaceId);
      if (result.message === "Already a member") {
        toast({
          title: "Info",
          description: "You are already a member of this workspace.",
        });
        navigate(`/workspace/${result.workspaceId}`);
      } else {
        toast({
          title: "Success",
          description: "Joined workspace successfully",
        });
        fetchWorkspaces(); // Refresh list
        navigate(`/workspace/${result.workspaceId}`);
      }
      setJoinOpen(false);
      setJoinWorkspaceId("");
    } catch (error: any) {
      console.error("Failed to join workspace:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to join workspace",
      });
    } finally {
      setJoining(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteOpen || !inviteEmail) return;

    setInviting(true);
    try {
      const res = await api.workspaces.invite(inviteOpen, inviteEmail);
      navigator.clipboard.writeText(res.link);
      toast({
        title: "Invited & Copied",
        description: "User added and invite link copied to clipboard",
      });
      setInviteEmail("");
      setInviteOpen(null);
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Error",
            description: error.message || "Failed to invite user",
        });
    } finally {
        setInviting(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'OWNER':
        return <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-400 text-[10px] font-bold tracking-wider border border-teal-500/20">OWNER</span>;
      case 'ADMIN':
        return <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold tracking-wider border border-purple-500/20">ADMIN</span>;
      case 'MEMBER':
        return <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold tracking-wider border border-blue-500/20">MEMBER</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full bg-gray-500/20 text-gray-400 text-[10px] font-bold tracking-wider border border-gray-500/20">VIEWER</span>;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex">
      {/* Background Effect */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background/95 to-background/90" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[128px]" />
      </div>

      {/* Sidebar - SaaS Style */}
      <aside className="hidden md:flex flex-col w-64 border-r border-white/10 bg-black/20 backdrop-blur-xl z-20 h-screen sticky top-0 pt-8 pb-6 px-4">
        {/* User Info Panel */}
        <div className="mb-8 p-4 rounded-xl bg-white/5 border border-white/10 shadow-lg relative overflow-hidden group hover:border-teal-500/30 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-white/20 ring-2 ring-transparent group-hover:ring-teal-500/30 transition-all">
              <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.email}`} alt={user?.email} />
              <AvatarFallback className="bg-gradient-to-br from-teal-500 to-cyan-500 text-white font-bold">
                {user?.email?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate" title={user?.email}>
                {user?.email?.split('@')[0]}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                Online
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2">
          <Button variant="ghost" className="w-full justify-start text-teal-400 bg-teal-500/10 hover:bg-teal-500/20 hover:text-teal-300">
            <LayoutGrid className="mr-2 h-4 w-4" />
            Workspaces
          </Button>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-white hover:bg-white/5">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </nav>

        {/* Logout */}
        <Button 
          variant="ghost" 
          className="w-full justify-start text-muted-foreground hover:text-red-400 hover:bg-red-500/10 mt-auto"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative z-10 pt-12 md:pt-24 px-6 md:px-12 pb-12 overflow-y-auto h-screen scrollbar-hide">
        <div className="max-w-7xl mx-auto">
          {/* Header Section */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
                Your Workspaces
              </h1>
              <p className="text-muted-foreground text-lg font-light">
                Manage and collaborate in real time.
              </p>
            </div>

            <div className="flex items-center gap-4 w-full lg:w-auto">
                {/* Join Workspace Button */}
                <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="h-12 px-6 border-white/10 hover:bg-white/5 text-white hover:text-teal-400 transition-all flex-1 lg:flex-none">
                            <DoorOpen className="mr-2 h-5 w-5" />
                            Join Workspace
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-black/90 backdrop-blur-2xl border-white/10 sm:max-w-[425px] shadow-2xl">
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-bold">Join Workspace</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleJoinWorkspace} className="space-y-6 mt-4">
                            <div className="space-y-2">
                                <label className="text-sm text-muted-foreground">Workspace ID</label>
                                <Input
                                    placeholder="Enter Workspace ID"
                                    value={joinWorkspaceId}
                                    onChange={(e) => setJoinWorkspaceId(e.target.value)}
                                    className="bg-white/5 border-white/10 focus:border-teal-500/50 h-12 text-lg px-4"
                                />
                                <p className="text-xs text-muted-foreground">Ask your team admin for the Workspace ID.</p>
                            </div>
                            <Button 
                                type="submit" 
                                className="w-full h-12 bg-white/10 hover:bg-white/20 text-white font-semibold text-lg border border-white/10"
                                disabled={joining}
                            >
                                {joining ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Join Workspace"}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Create Workspace Button */}
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                    <Button className="h-12 px-6 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white shadow-lg shadow-teal-500/25 transition-all duration-300 hover:scale-105 border border-white/10 rounded-xl flex-1 lg:flex-none">
                    <Plus className="mr-2 h-5 w-5" />
                    Create New
                    </Button>
                </DialogTrigger>
                <DialogContent className="bg-black/90 backdrop-blur-2xl border-white/10 sm:max-w-[425px] shadow-2xl">
                    <DialogHeader>
                    <DialogTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">Create Workspace</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateWorkspace} className="space-y-6 mt-4">
                    <div className="space-y-2">
                        <Input
                        placeholder="Workspace Name (e.g., Project Alpha)"
                        value={newWorkspaceName}
                        onChange={(e) => setNewWorkspaceName(e.target.value)}
                        className="bg-white/5 border-white/10 focus:border-teal-500/50 focus:ring-teal-500/20 h-12 text-lg px-4 transition-all"
                        />
                    </div>
                    <Button 
                        type="submit" 
                        className="w-full h-12 bg-gradient-to-r from-teal-500 to-cyan-500 font-semibold text-lg"
                        disabled={creating}
                    >
                        {creating ? (
                        <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Creating...
                        </>
                        ) : (
                        "Create Workspace"
                        )}
                    </Button>
                    </form>
                </DialogContent>
                </Dialog>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-48 rounded-2xl bg-white/5 animate-pulse border border-white/5" />
                ))}
            </div>
          ) : workspaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 px-4 text-center animate-in fade-in zoom-in duration-500 border border-dashed border-white/10 rounded-3xl bg-white/5">
              <div className="relative mb-8 group">
                <div className="absolute inset-0 bg-teal-500/20 rounded-full blur-3xl group-hover:bg-teal-500/30 transition-all duration-500" />
                <div className="relative p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl">
                  <Users className="h-16 w-16 text-teal-500" />
                </div>
              </div>
              <h3 className="text-3xl font-bold text-white mb-3">No workspaces yet</h3>
              <p className="text-muted-foreground text-lg mb-8 max-w-md mx-auto leading-relaxed">
                Create your first workspace or join an existing one to start collaborating.
              </p>
              <Button 
                onClick={() => setCreateOpen(true)}
                size="lg"
                className="h-12 px-8 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-teal-500/50 text-white transition-all duration-300 hover:scale-105"
              >
                <Plus className="mr-2 h-5 w-5" />
                Create Workspace
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
              {workspaces.map((workspace, index) => {
                const userRole = workspace.members.find(m => m.userId === user?.id)?.role || 'VIEWER';
                return (
                    <Card 
                    key={workspace.id}
                    className="group relative overflow-hidden bg-white/5 backdrop-blur-md border-white/10 hover:border-teal-500/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-teal-500/10 animate-in fade-in slide-in-from-bottom-4 flex flex-col justify-between"
                    style={{ animationDelay: `${index * 50}ms` }}
                    >
                    <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    
                    <CardHeader className="relative z-10 pb-2">
                        <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2">
                            {getRoleBadge(userRole)}
                            <span className="text-xs text-muted-foreground flex items-center gap-1 ml-2">
                                <Clock className="h-3 w-3" />
                                {new Date(workspace.createdAt).toLocaleDateString()}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground bg-black/20 px-2 py-1 rounded-full text-xs border border-white/5">
                            <Users className="h-3 w-3" />
                            {workspace.members.length}
                        </div>
                        </div>
                        <CardTitle className="text-2xl font-bold text-white group-hover:text-teal-400 transition-colors">
                            {workspace.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-2 font-mono opacity-50 truncate" title="Workspace ID">
                            ID: {workspace.id}
                        </p>
                    </CardHeader>

                    <CardContent className="relative z-10 pt-4 flex items-center gap-2 mt-auto">
                        <Button 
                            className="flex-1 bg-white/5 hover:bg-teal-500/20 text-white hover:text-teal-300 border border-white/10 hover:border-teal-500/50 transition-all group-hover:shadow-lg group-hover:shadow-teal-500/10"
                            onClick={() => navigate(`/workspace/${workspace.id}`)}
                        >
                            Open Workspace
                        </Button>
                        
                        {(userRole === 'OWNER' || userRole === 'ADMIN') && (
                            <Dialog open={inviteOpen === workspace.id} onOpenChange={(open) => { setInviteOpen(open ? workspace.id : null); setInviteEmail(""); }}>
                                <DialogTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-10 w-10 border border-white/10 hover:bg-white/10 hover:text-white">
                                    <Users className="h-4 w-4" />
                                </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-black/90 backdrop-blur-2xl border-white/10 shadow-2xl">
                                <DialogHeader>
                                    <DialogTitle>Invite Collaborators</DialogTitle>
                                </DialogHeader>
                                <form onSubmit={handleInvite} className="space-y-4 py-4">
                                    <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/20">
                                    <p className="text-sm text-teal-200">
                                        Invite others to <strong className="text-white">{workspace.name}</strong>
                                    </p>
                                    </div>
                                    <div className="space-y-2">
                                    <Input 
                                        type="email"
                                        placeholder="colleague@example.com"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        className="bg-white/5 border-white/10 focus:ring-teal-500/20"
                                        required
                                    />
                                    </div>
                                    <Button type="submit" disabled={inviting} className="w-full bg-teal-500 hover:bg-teal-600 shadow-lg shadow-teal-500/20">
                                    {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                                    Invite & Copy Link
                                    </Button>
                                </form>
                                </DialogContent>
                            </Dialog>
                        )}
                    </CardContent>
                    </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

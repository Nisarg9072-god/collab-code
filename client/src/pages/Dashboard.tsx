import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus, Users, ArrowRight, Loader2, LayoutGrid, LogOut, Clock, DoorOpen, Search, Bell, Command, Star } from "lucide-react";
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

  // Search State
  const [searchQuery, setSearchQuery] = useState("");

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

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const filteredWorkspaces = workspaces.filter(w => 
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Mock Recent Activity
  const recentActivity = [
    { id: 1, text: "You edited main.tsx in Frontend", time: "2m ago", type: "edit" },
    { id: 2, text: "Alex joined Backend API", time: "1h ago", type: "join" },
    { id: 3, text: "New deployment in Landing Page", time: "3h ago", type: "deploy" },
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navigation - Control Center Style */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <a className="flex items-center space-x-2" href="/">
              <div className="bg-primary/10 p-2 rounded-lg">
                <LayoutGrid className="h-5 w-5 text-primary" />
              </div>
              <span className="hidden font-bold sm:inline-block text-lg tracking-tight">CollabCode</span>
            </a>
            <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
              <a className="text-foreground hover:text-primary transition-colors" href="/dashboard">Dashboard</a>
              <a className="text-muted-foreground hover:text-foreground transition-colors" href="#">My Tasks</a>
              <a className="text-muted-foreground hover:text-foreground transition-colors" href="#">Inbox</a>
            </nav>
          </div>

          <div className="hidden md:flex flex-1 items-center justify-center max-w-md relative">
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search workspaces, files, or people... (Cmd+K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 pl-10 w-full bg-muted/50 border-transparent focus:bg-background focus:border-primary/50 transition-all"
            />
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <Bell className="h-5 w-5" />
            </Button>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex items-center gap-3">
                <div className="hidden md:block text-right">
                    <p className="text-sm font-medium leading-none">{user?.name || 'User'}</p>
                    <p className="text-xs text-muted-foreground mt-1">{user?.email}</p>
                </div>
                <Avatar className="h-9 w-9 border border-white/10">
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
          
          {/* Main Content Area */}
          <div className="lg:col-span-8 space-y-8">
            {/* Quick Actions / Welcome */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-br from-primary/5 via-primary/5 to-transparent p-6 rounded-2xl border border-primary/10">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight mb-2">Welcome back, {user?.name?.split(' ')[0] || 'Developer'}</h1>
                    <p className="text-muted-foreground">You have {workspaces.length} active workspaces. What would you like to build today?</p>
                </div>
                <div className="flex items-center gap-3">
                    <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="gap-2 h-10 border-primary/20 hover:bg-primary/5">
                                <DoorOpen className="h-4 w-4" />
                                Join with ID
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Join Existing Workspace</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleJoinWorkspace} className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Workspace ID</label>
                                    <Input 
                                        placeholder="Enter workspace ID..." 
                                        value={joinWorkspaceId}
                                        onChange={(e) => setJoinWorkspaceId(e.target.value)}
                                    />
                                </div>
                                <Button type="submit" className="w-full" disabled={joining}>
                                    {joining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Join Workspace"}
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2 h-10 shadow-lg shadow-primary/20">
                                <Plus className="h-4 w-4" />
                                New Workspace
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create New Workspace</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleCreateWorkspace} className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Workspace Name</label>
                                    <Input 
                                        placeholder="e.g. My Awesome Project" 
                                        value={newWorkspaceName}
                                        onChange={(e) => setNewWorkspaceName(e.target.value)}
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

            {/* Workspaces List */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <LayoutGrid className="h-4 w-4 text-primary" />
                        Your Workspaces
                    </h2>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-xs">Recently Updated</Button>
                        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground text-xs">Alphabetical</Button>
                    </div>
                </div>

                {filteredWorkspaces.length === 0 ? (
                    <Card className="border-dashed bg-muted/20">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="rounded-full bg-background p-4 mb-4 border shadow-sm">
                                <LayoutGrid className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium">No workspaces found</h3>
                            <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-6">
                                {searchQuery ? "Try adjusting your search terms." : "Get started by creating your first workspace to collaborate with your team."}
                            </p>
                            {!searchQuery && (
                                <Button onClick={() => setCreateOpen(true)} variant="outline">
                                    Create Workspace
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredWorkspaces.map((workspace) => (
                            <Card 
                                key={workspace.id} 
                                className="group cursor-pointer hover:border-primary/50 transition-all hover:shadow-md bg-card/50 backdrop-blur-sm border-white/5"
                                onClick={() => navigate(`/workspace/${workspace.id}`)}
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <CardTitle className="text-base font-medium group-hover:text-primary transition-colors flex items-center gap-2">
                                                {workspace.name}
                                            </CardTitle>
                                            <p className="text-xs text-muted-foreground font-mono">
                                                ID: {workspace.id.substring(0, 8)}...
                                            </p>
                                        </div>
                                        <div className="flex -space-x-2">
                                            {workspace.members.slice(0, 3).map((member, i) => (
                                                <Avatar key={i} className="h-6 w-6 border-2 border-background">
                                                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                                        {member.role[0]}
                                                    </AvatarFallback>
                                                </Avatar>
                                            ))}
                                            {workspace.members.length > 3 && (
                                                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] border-2 border-background font-medium text-muted-foreground">
                                                    +{workspace.members.length - 3}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                <span>{new Date(workspace.updatedAt).toLocaleDateString()}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Users className="h-3 w-3" />
                                                <span>{workspace.members.length}</span>
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

          {/* Sidebar - Activity & Info */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Quick Stats / Pro Tip */}
            <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/20 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <CardContent className="p-6 space-y-4 relative z-10">
                    <div className="flex items-center gap-2 text-primary font-semibold">
                        <Star className="h-4 w-4" />
                        <span>Pro Tip</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Use <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">Cmd+K</kbd> to open the command palette and navigate between files quickly.
                    </p>
                </CardContent>
            </Card>

            {/* Recent Activity Feed */}
            <Card className="bg-card/50 backdrop-blur-sm border-white/5">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        Recent Activity
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-0">
                        {recentActivity.map((activity, i) => (
                            <div key={activity.id} className="flex gap-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 p-2 rounded-lg transition-colors cursor-pointer group">
                                <div className={`h-2 w-2 mt-2 rounded-full flex-shrink-0 ${
                                    activity.type === 'edit' ? 'bg-blue-500' : 
                                    activity.type === 'join' ? 'bg-green-500' : 'bg-purple-500'
                                }`} />
                                <div className="space-y-1">
                                    <p className="text-sm text-foreground/90 group-hover:text-primary transition-colors">{activity.text}</p>
                                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Button variant="ghost" size="sm" className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground">
                        View All Activity
                    </Button>
                </CardContent>
            </Card>

            {/* Team / Members (Placeholder) */}
            <Card className="bg-card/50 backdrop-blur-sm border-white/5">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Users className="h-3 w-3" />
                        Online Team
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex -space-x-2 overflow-hidden py-2">
                         {[1,2,3,4].map((i) => (
                            <Avatar key={i} className="inline-block h-8 w-8 ring-2 ring-background grayscale hover:grayscale-0 transition-all cursor-pointer">
                                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`} />
                                <AvatarFallback>T{i}</AvatarFallback>
                            </Avatar>
                         ))}
                         <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium ring-2 ring-background">
                            +5
                         </div>
                    </div>
                </CardContent>
            </Card>

          </div>
        </div>
      </main>
    </div>
  );
}
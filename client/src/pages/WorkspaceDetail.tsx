import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Users, Settings, Layout, Trash2, LogOut, Code, Copy, Check, Shield, ShieldAlert, Loader2, Edit2, Activity } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

interface Member {
  id: string;
  workspaceId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "EDITOR" | "VIEWER";
  user: {
    id: string;
    email: string;
    createdAt: string;
  };
}

interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  members: Member[];
}

export default function WorkspaceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Actions State
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [activeUserIds, setActiveUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (id) {
        fetchWorkspace();
        // Enter presence
        api.workspaces.enterPresence(id);
        
        // Poll presence every 5s
        const interval = setInterval(async () => {
            try {
                const data = await api.workspaces.getPresence(id);
                setActiveUserIds(data.activeUsers);
            } catch (e) {
                console.error("Presence poll failed", e);
            }
        }, 5000);

        return () => {
            clearInterval(interval);
            api.workspaces.leavePresence(id);
        }
    }
  }, [id]);

  const fetchWorkspace = async () => {
    try {
      if (!id) return;
      const data = await api.workspaces.get(id);
      setWorkspace(data);
      setNewName(data.name);
    } catch (error) {
      console.error("Failed to fetch workspace:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load workspace details",
      });
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !inviteEmail) return;

    setInviting(true);
    try {
      const res = await api.workspaces.invite(id, inviteEmail);
      navigator.clipboard.writeText(res.link);
      toast({
        title: "Invited & Copied",
        description: "User added and invite link copied to clipboard",
      });
      setInviteEmail("");
      fetchWorkspace(); // Refresh list
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

  const handleRemoveMember = async (userId: string) => {
    if (!id) return;
    try {
      await api.workspaces.removeMember(id, userId);
      toast({ title: "Success", description: "Member removed" });
      fetchWorkspace();
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Error",
            description: error.message || "Failed to remove member",
        });
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!id) return;
    try {
        await api.workspaces.updateRole(id, userId, newRole);
        toast({ title: "Success", description: "Role updated" });
        fetchWorkspace();
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Error",
            description: error.message || "Failed to update role",
        });
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!id) return;
    try {
        await api.workspaces.delete(id);
        toast({ title: "Success", description: "Workspace deleted" });
        navigate("/dashboard");
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Error",
            description: error.message || "Failed to delete workspace",
        });
    }
  };

  const handleUpdateName = async () => {
    if (!id || !newName.trim()) return;
    try {
        await api.workspaces.update(id, newName);
        toast({ title: "Success", description: "Workspace name updated" });
        setEditOpen(false);
        fetchWorkspace();
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Error",
            description: error.message || "Failed to update workspace",
        });
    }
  };

  const currentUserRole = workspace?.members.find(m => m.userId === user?.id)?.role || 'VIEWER';
  const isOwnerOrAdmin = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';

  if (loading) {
    return (
        <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex flex-col">
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-background via-background/95 to-background/90" />
            </div>
            
            {/* Header Skeleton */}
            <header className="z-10 border-b border-white/10 bg-black/20 backdrop-blur-xl sticky top-0">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Skeleton className="h-10 w-10 rounded-md bg-white/5" />
                        <div className="space-y-2">
                            <Skeleton className="h-6 w-48 bg-white/5" />
                            <Skeleton className="h-3 w-32 bg-white/5" />
                        </div>
                    </div>
                    <Skeleton className="h-10 w-24 bg-white/5" />
                </div>
            </header>

            {/* Main Content Skeleton */}
            <main className="flex-1 relative z-10 p-6 md:p-8">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Tabs Skeleton */}
                    <Skeleton className="h-10 w-64 bg-white/5" />
                    
                    {/* Overview Cards Skeleton */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-32 rounded-xl bg-white/5" />
                        ))}
                    </div>

                    {/* Quick Actions Skeleton */}
                    <div className="mt-8 space-y-4">
                        <Skeleton className="h-8 w-40 bg-white/5" />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[1, 2].map((i) => (
                                <Skeleton key={i} className="h-24 rounded-xl bg-white/5" />
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
  }

  if (!workspace) return null;

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex flex-col">
      {/* Background Effect */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background/95 to-background/90" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[128px]" />
      </div>

      {/* Header */}
      <header className="z-10 border-b border-white/10 bg-black/20 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-white">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        {workspace.name}
                        {isOwnerOrAdmin && (
                            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-white">
                                        <Edit2 className="h-3 w-3" />
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-black/90 backdrop-blur-2xl border-white/10">
                                    <DialogHeader>
                                        <DialogTitle>Edit Workspace Name</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-white/5 border-white/10" />
                                        <Button onClick={handleUpdateName} className="w-full bg-teal-500 hover:bg-teal-600">Save</Button>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        )}
                    </h1>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Activity className="h-3 w-3 text-teal-500" />
                            {activeUserIds.length} Active
                        </span>
                        <span>•</span>
                        <span>Created {new Date(workspace.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                <Button 
                    className="bg-teal-500 hover:bg-teal-600 text-white border-0"
                    onClick={() => navigate(`/workspace/${id}/editor`)}
                >
                    <Code className="mr-2 h-4 w-4" />
                    Open Editor
                </Button>

                {/* Invite Button */}
                <Dialog>
                    <DialogTrigger asChild>
                        <Button className="bg-white/10 hover:bg-white/20 text-white border border-white/10">
                            <Users className="mr-2 h-4 w-4" />
                            Invite
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-black/90 backdrop-blur-2xl border-white/10">
                        <DialogHeader>
                            <DialogTitle>Invite to {workspace.name}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleInvite} className="space-y-4 py-4">
                            <Input 
                                placeholder="Email address" 
                                value={inviteEmail} 
                                onChange={(e) => setInviteEmail(e.target.value)} 
                                className="bg-white/5 border-white/10"
                            />
                            <Button type="submit" disabled={inviting} className="w-full bg-teal-500 hover:bg-teal-600">
                                {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Invite & Copy Link"}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-10 p-6 md:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
            <Tabs defaultValue="overview" className="space-y-6">
                <TabsList className="bg-white/5 border border-white/10 p-1">
                    <TabsTrigger value="overview" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">Overview</TabsTrigger>
                    <TabsTrigger value="members" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">Members</TabsTrigger>
                    {isOwnerOrAdmin && <TabsTrigger value="settings" className="data-[state=active]:bg-teal-500 data-[state=active]:text-white">Settings</TabsTrigger>}
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                            <CardHeader>
                                <CardTitle className="text-lg text-white">Members</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-teal-400">{workspace.members.length}</div>
                                <p className="text-muted-foreground text-sm">Total collaborators</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                            <CardHeader>
                                <CardTitle className="text-lg text-white">Your Role</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-teal-400">{currentUserRole}</div>
                                <p className="text-muted-foreground text-sm">Access Level</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                            <CardHeader>
                                <CardTitle className="text-lg text-white">Live Now</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-teal-400">{activeUserIds.length}</div>
                                <p className="text-muted-foreground text-sm">Active users</p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="mt-8">
                        <h2 className="text-xl font-bold text-white mb-4">Quick Actions</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-white/10 hover:bg-white/5 text-white hover:text-teal-400" onClick={() => toast({ title: "Coming Soon", description: "Documents feature is coming soon" })}>
                                <Layout className="h-6 w-6" />
                                <span>Create Document</span>
                            </Button>
                            <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-white/10 hover:bg-white/5 text-white hover:text-teal-400" onClick={() => toast({ title: "Coming Soon", description: "Whiteboard feature is coming soon" })}>
                                <Layout className="h-6 w-6" />
                                <span>New Whiteboard</span>
                            </Button>
                        </div>
                    </div>
                </TabsContent>

                {/* Members Tab */}
                <TabsContent value="members" className="animate-in fade-in slide-in-from-bottom-2">
                    <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-white">Team Members</CardTitle>
                                <CardDescription>Manage who has access to this workspace.</CardDescription>
                            </div>
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button size="sm" className="bg-teal-500 hover:bg-teal-600 text-white">
                                        <Users className="mr-2 h-4 w-4" />
                                        Invite New
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-black/90 backdrop-blur-2xl border-white/10">
                                    <DialogHeader>
                                        <DialogTitle>Invite to {workspace.name}</DialogTitle>
                                    </DialogHeader>
                                    <form onSubmit={handleInvite} className="space-y-4 py-4">
                                        <Input 
                                            placeholder="Email address" 
                                            value={inviteEmail} 
                                            onChange={(e) => setInviteEmail(e.target.value)} 
                                            className="bg-white/5 border-white/10"
                                        />
                                        <Button type="submit" disabled={inviting} className="w-full bg-teal-500 hover:bg-teal-600">
                                            {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Invite & Copy Link"}
                                        </Button>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {workspace.members.length === 1 ? (
                                <div className="text-center py-12 border border-dashed border-white/10 rounded-xl bg-white/5">
                                    <div className="mx-auto w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center mb-4">
                                        <Users className="h-6 w-6 text-teal-500" />
                                    </div>
                                    <h3 className="text-lg font-medium text-white mb-2">It's just you here</h3>
                                    <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                                        Workspaces are better with a team. Invite your colleagues to start collaborating.
                                    </p>
                                    {/* Member (You) Row */}
                                    <div className="max-w-md mx-auto text-left bg-black/20 rounded-lg p-3 border border-white/5 mb-4">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8 border border-white/10">
                                                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${workspace.members[0].user.email}`} />
                                                <AvatarFallback>{workspace.members[0].user.email[0].toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-sm font-medium text-white">{workspace.members[0].user.email} (You)</p>
                                                <Badge variant="outline" className="text-[10px] border-white/10 text-muted-foreground mt-1">
                                                    {workspace.members[0].role}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                workspace.members.map((member) => (
                                    <div key={member.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <Avatar className="h-10 w-10 border border-white/10">
                                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${member.user.email}`} />
                                                    <AvatarFallback>{member.user.email[0].toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                {activeUserIds.includes(member.userId) && (
                                                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-teal-500 border-2 border-black" title="Online" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">
                                                    {member.user.email}
                                                    {member.userId === user?.id && " (You)"}
                                                </p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <Badge variant="outline" className="text-[10px] border-white/10 text-muted-foreground">
                                                        {member.role}
                                                    </Badge>
                                                    {activeUserIds.includes(member.userId) && (
                                                        <span className="text-[10px] text-teal-400">Online</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        {isOwnerOrAdmin && member.userId !== user?.id && (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white">
                                                        <Settings className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="bg-black/90 backdrop-blur-xl border-white/10">
                                                    <DropdownMenuLabel>Manage Access</DropdownMenuLabel>
                                                    <DropdownMenuSeparator className="bg-white/10" />
                                                    <DropdownMenuItem onClick={() => handleRoleChange(member.userId, 'ADMIN')}>
                                                        Make Admin
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleRoleChange(member.userId, 'MEMBER')}>
                                                        Make Member
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleRoleChange(member.userId, 'VIEWER')}>
                                                        Make Viewer
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator className="bg-white/10" />
                                                    <DropdownMenuItem 
                                                        className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
                                                        onClick={() => handleRemoveMember(member.userId)}
                                                        disabled={member.role === 'OWNER'}
                                                    >
                                                        Remove from Workspace
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        )}
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Settings Tab */}
                {isOwnerOrAdmin && (
                    <TabsContent value="settings" className="animate-in fade-in slide-in-from-bottom-2">
                        <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                            <CardHeader>
                                <CardTitle className="text-white">Workspace Settings</CardTitle>
                                <CardDescription>Manage workspace preferences and danger zone.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-4">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-medium text-white">Workspace Name</label>
                                        <div className="flex gap-2">
                                            <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-white/5 border-white/10" />
                                            <Button onClick={handleUpdateName} className="bg-teal-500 hover:bg-teal-600">Save</Button>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-white/10">
                                    <h3 className="text-red-400 font-medium mb-2 flex items-center gap-2">
                                        <ShieldAlert className="h-4 w-4" /> Danger Zone
                                    </h3>
                                    <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/5 flex items-center justify-between">
                                        <div>
                                            <p className="text-white font-medium">Delete this workspace</p>
                                            <p className="text-sm text-muted-foreground">Once deleted, it cannot be recovered.</p>
                                        </div>
                                        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                                            <DialogTrigger asChild>
                                                <Button variant="destructive" className="bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 border border-red-500/20">
                                                    Delete Workspace
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="bg-black/90 backdrop-blur-2xl border-white/10">
                                                <DialogHeader>
                                                    <DialogTitle className="text-red-500">Delete Workspace?</DialogTitle>
                                                    <DialogDescription>
                                                        This action cannot be undone. This will permanently delete 
                                                        <span className="font-bold text-white"> {workspace.name} </span>
                                                        and remove all member access.
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <DialogFooter>
                                                    <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                                                    <Button variant="destructive" onClick={handleDeleteWorkspace}>Yes, Delete</Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>
        </div>
      </main>
    </div>
  );
}

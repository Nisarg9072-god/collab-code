import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/UI/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/UI/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/UI/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/UI/avatar";
import { Badge } from "@/components/UI/badge";
import { Skeleton } from "@/components/UI/skeleton";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/UI/dialog";
import { Input } from "@/components/UI/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/UI/select";
import {
    ArrowLeft, Users, Settings, Trash2, Code, Copy, Check, Shield, ShieldAlert,
    Loader2, Edit2, Activity, FileText, Plus, Crown, Eye, Clock, AlertTriangle, UserCheck, UserX, RefreshCw
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/UI/dropdown-menu";

// ─── Types ───────────────────────────────────────────────────────────────────

type Role = "OWNER" | "ADMIN" | "EDITOR" | "MEMBER" | "VIEWER" | "VISITOR";

interface FileItem {
    id: string;
    name: string;
    language: string;
    updatedAt?: string;
}

interface Member {
    id: string;
    workspaceId: string;
    userId: string;
    role: Role;
    user: { id: string; email: string; displayName?: string; createdAt: string };
}

interface JoinRequest {
    id: string;
    workspaceId: string;
    message?: string;
    status: string;
    createdAt: string;
    user: { id: string; email: string; displayName?: string };
}

interface Workspace {
    id: string;
    name: string;
    ownerId: string;
    createdAt: string;
    members: Member[];
}

// ─── Role badge helpers ───────────────────────────────────────────────────────

const ROLE_COLORS: Record<Role, string> = {
    OWNER: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    ADMIN: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    EDITOR: "bg-teal-500/20 text-teal-400 border-teal-500/30",
    MEMBER: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    VIEWER: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    VISITOR: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const ROLE_ICON: Record<Role, JSX.Element> = {
    OWNER: <Crown className="h-3 w-3" />,
    ADMIN: <Shield className="h-3 w-3" />,
    EDITOR: <Code className="h-3 w-3" />,
    MEMBER: <Users className="h-3 w-3" />,
    VIEWER: <Eye className="h-3 w-3" />,
    VISITOR: <Clock className="h-3 w-3" />,
};

function RoleBadge({ role }: { role: Role }) {
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${ROLE_COLORS[role] ?? "bg-muted text-muted-foreground border-border"}`}>
            {ROLE_ICON[role]}
            {role}
        </span>
    );
}

// ─── Copy button utility ──────────────────────────────────────────────────────
function CopyButton({ text, label }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    const doCopy = () => {
        navigator.clipboard.writeText(text).catch(() => { });
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={doCopy} title={`Copy ${label ?? text}`}>
            {copied ? <Check className="h-3.5 w-3.5 text-teal-400" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
    );
}

// ─── Visitor Expiry Modal ─────────────────────────────────────────────────────
function VisitorExpiredModal({ open, onRequestAccess }: { open: boolean; onRequestAccess: () => void }) {
    return (
        <Dialog open={open}>
            <DialogContent className="bg-background/95 backdrop-blur-2xl border-orange-500/30 max-w-md" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <div className="flex items-center gap-2 text-orange-400 mb-2">
                        <AlertTriangle className="h-5 w-5" />
                        <DialogTitle className="text-orange-400">Daily Access Limit Reached</DialogTitle>
                    </div>
                    <DialogDescription className="text-muted-foreground">
                        Your 2-hour visitor session has expired. You can no longer edit files in this workspace today.
                    </DialogDescription>
                </DialogHeader>
                <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-4 space-y-2">
                    <p className="text-sm text-orange-300 font-medium">What can you do?</p>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Request permanent access from the workspace owner</li>
                        <li>Wait until tomorrow to use visitor access again</li>
                    </ul>
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                        onClick={onRequestAccess}
                    >
                        Request Permanent Access
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WorkspaceDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [loading, setLoading] = useState(true);
    const [files, setFiles] = useState<FileItem[]>([]);
    const [activeUserIds, setActiveUserIds] = useState<string[]>([]);

    // Invite state
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<string>("EDITOR");
    const [inviting, setInviting] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);

    // Rename/delete state
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [newName, setNewName] = useState("");

    // Join requests (for owner/admin panel)
    const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
    const [loadingRequests, setLoadingRequests] = useState(false);

    // Visitor session state
    const [visitorExpired, setVisitorExpired] = useState(false);
    const [sessionInfo, setSessionInfo] = useState<any>(null);
    const sessionTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Data fetching ─────────────────────────────────────────────────────────

    const fetchWorkspace = useCallback(async () => {
        if (!id) return;
        try {
            const data = await api.workspaces.get(id);
            setWorkspace(data);
            setNewName(data.name);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to load workspace" });
            navigate("/dashboard");
        } finally {
            setLoading(false);
        }
    }, [id, navigate]);

    const fetchFiles = useCallback(async () => {
        if (!id) return;
        try {
            const data = await api.files.list(id);
            setFiles(data ?? []);
        } catch { /* silent */ }
    }, [id]);

    const fetchJoinRequests = useCallback(async () => {
        if (!id) return;
        setLoadingRequests(true);
        try {
            const data = await api.joinRequests.list(id);
            setJoinRequests(data ?? []);
        } catch {
            // non-admin — silently ignore 403
        } finally {
            setLoadingRequests(false);
        }
    }, [id]);

    const checkSession = useCallback(async () => {
        if (!id) return;
        try {
            const session = await api.sessions.get(id);
            setSessionInfo(session);
            if (session?.hasSession && session?.expired) {
                setVisitorExpired(true);
            }
        } catch { /* silent */ }
    }, [id]);

    useEffect(() => {
        if (!id) return;
        fetchWorkspace();
        fetchFiles();
        checkSession();

        api.workspaces.enterPresence(id);

        const presenceInterval = setInterval(async () => {
            try {
                const data = await api.workspaces.getPresence(id);
                setActiveUserIds(data?.activeUsers ?? []);
            } catch { }
        }, 5000);

        return () => {
            clearInterval(presenceInterval);
            if (sessionTimer.current) clearInterval(sessionTimer.current);
            api.workspaces.leavePresence(id);
        };
    }, [id, fetchWorkspace, fetchFiles, checkSession]);

    // Start countdown timer for visitor sessions
    useEffect(() => {
        if (!sessionInfo?.hasSession || !sessionInfo?.active || !sessionInfo?.expiresAt) return;
        if (sessionTimer.current) clearInterval(sessionTimer.current);

        sessionTimer.current = setInterval(() => {
            const remaining = new Date(sessionInfo.expiresAt).getTime() - Date.now();
            if (remaining <= 0) {
                setVisitorExpired(true);
                if (sessionTimer.current) clearInterval(sessionTimer.current);
            }
        }, 10_000); // check every 10s

        return () => { if (sessionTimer.current) clearInterval(sessionTimer.current); };
    }, [sessionInfo]);

    // ── Computed values ───────────────────────────────────────────────────────

    const currentUserRole: Role = workspace?.members.find(m => m.userId === user?.id)?.role ?? "VIEWER";
    const isOwnerOrAdmin = currentUserRole === "OWNER" || currentUserRole === "ADMIN";
    const isVisitor = currentUserRole === "VISITOR" || (!workspace?.members.find(m => m.userId === user?.id));
    const canEdit = ["OWNER", "ADMIN", "EDITOR", "MEMBER"].includes(currentUserRole);

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !inviteEmail.trim()) return;

        setInviting(true);
        try {
            const res = await api.workspaces.invite(id, inviteEmail.trim(), inviteRole);

            // Copy invite link if provided
            if (res?.inviteLink) {
                navigator.clipboard.writeText(res.inviteLink).catch(() => { });
            }

            const msg = res?.userExists
                ? `${inviteEmail} has been added to the workspace as ${inviteRole}.`
                : `Invitation sent! ${inviteEmail} will join when they register.`;

            toast({ title: res?.userExists ? "✅ Member Added" : "📧 Invitation Sent", description: msg });
            setInviteEmail("");
            setInviteOpen(false);
            fetchWorkspace();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Invite Failed", description: error.message || "Failed to send invitation" });
        } finally {
            setInviting(false);
        }
    };

    const handleRemoveMember = async (userId: string) => {
        if (!id) return;
        try {
            await api.workspaces.removeMember(id, userId);
            toast({ title: "Member removed" });
            fetchWorkspace();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to remove member" });
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        if (!id) return;
        try {
            await api.workspaces.updateRole(id, userId, newRole);
            toast({ title: "Role updated", description: `Role changed to ${newRole}` });
            fetchWorkspace();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update role" });
        }
    };

    const handleDeleteWorkspace = async () => {
        if (!id) return;
        try {
            await api.workspaces.delete(id);
            toast({ title: "Workspace deleted" });
            navigate("/dashboard");
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete workspace" });
        }
    };

    const handleUpdateName = async () => {
        if (!id || !newName.trim()) return;
        try {
            await api.workspaces.update(id, newName);
            toast({ title: "Name updated" });
            setEditOpen(false);
            fetchWorkspace();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update workspace name" });
        }
    };

    const handleApproveRequest = async (requestId: string, role = "MEMBER") => {
        try {
            await api.joinRequests.approve(requestId, role);
            toast({ title: "✅ Request approved", description: "User has been added to the workspace" });
            fetchJoinRequests();
            fetchWorkspace();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to approve request" });
        }
    };

    const handleRejectRequest = async (requestId: string) => {
        try {
            await api.joinRequests.reject(requestId);
            toast({ title: "Request rejected" });
            fetchJoinRequests();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to reject request" });
        }
    };

    const handleRequestAccess = async () => {
        if (!id) return;
        try {
            const res = await api.joinRequests.request(id, "Visitor session expired — requesting permanent access");
            toast({ title: "Request Sent", description: res?.message || "Your request has been sent to the workspace owner" });
            setVisitorExpired(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        }
    };

    // ── Loading UI ────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex flex-col">
                <header className="z-10 border-b border-border bg-card/60 backdrop-blur-xl sticky top-0">
                    <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-4">
                        <Skeleton className="h-10 w-10 rounded-md bg-muted/40" />
                        <div className="space-y-2">
                            <Skeleton className="h-6 w-48 bg-muted/40" />
                            <Skeleton className="h-3 w-32 bg-muted/40" />
                        </div>
                    </div>
                </header>
                <main className="flex-1 p-8">
                    <div className="max-w-7xl mx-auto grid grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl bg-muted/40" />)}
                    </div>
                </main>
            </div>
        );
    }

    if (!workspace) return null;

    // ── Main render ───────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex flex-col">
            {/* Background blobs */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-background via-background/95 to-background/90" />
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[128px]" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[128px]" />
            </div>

            {/* Visitor session expiry popup */}
            <VisitorExpiredModal open={visitorExpired && !canEdit} onRequestAccess={handleRequestAccess} />

            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <header className="z-10 border-b border-border bg-card/60 backdrop-blur-xl sticky top-0">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                            <h1 className="text-xl font-bold flex items-center gap-2">
                                {workspace.name}
                                {isOwnerOrAdmin && (
                                    <Dialog open={editOpen} onOpenChange={setEditOpen}>
                                        <DialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground">
                                                <Edit2 className="h-3 w-3" />
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="bg-background/95 backdrop-blur-2xl border-border">
                                            <DialogHeader><DialogTitle>Edit Workspace Name</DialogTitle></DialogHeader>
                                            <div className="space-y-4 py-4">
                                                <Input value={newName} onChange={e => setNewName(e.target.value)} className="bg-background border-border" />
                                                <Button onClick={handleUpdateName} className="w-full bg-teal-500 hover:bg-teal-600">Save</Button>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                )}
                            </h1>
                            {/* Workspace ID display */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Activity className="h-3 w-3 text-teal-500" />
                                <span>{activeUserIds.length} Active</span>
                                <span>•</span>
                                <span className="font-mono">ID: {workspace.id.substring(0, 12)}…</span>
                                <CopyButton text={workspace.id} label="Workspace ID" />
                                <span>•</span>
                                <RoleBadge role={currentUserRole} />
                                {sessionInfo?.hasSession && sessionInfo?.active && (
                                    <span className="text-orange-400 flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {Math.max(0, Math.ceil((new Date(sessionInfo.expiresAt).getTime() - Date.now()) / 60000))}m left
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            className="bg-teal-500 hover:bg-teal-600 text-white border-0"
                            onClick={() => navigate(`/workspace/${id}/editor`)}
                            disabled={visitorExpired && !canEdit}
                        >
                            <Code className="mr-2 h-4 w-4" />
                            Open Editor
                        </Button>

                        {/* Invite button — only OWNER or ADMIN */}
                        {isOwnerOrAdmin && (
                            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                                <DialogTrigger asChild>
                                    <Button className="bg-muted/40 hover:bg-muted/60 text-foreground border border-border">
                                        <Users className="mr-2 h-4 w-4" />
                                        Invite
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-background/95 backdrop-blur-2xl border-border">
                                    <DialogHeader>
                                        <DialogTitle>Invite to {workspace.name}</DialogTitle>
                                        <DialogDescription>
                                            Send an invitation by email. If the user doesn't have an account yet, they'll be added when they sign up.
                                        </DialogDescription>
                                    </DialogHeader>

                                    {/* Workspace ID copyable area */}
                                    <div className="rounded-lg bg-muted/30 border border-border p-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-muted-foreground font-medium mb-1">Workspace ID</p>
                                            <p className="text-sm font-mono break-all">{workspace.id}</p>
                                        </div>
                                        <CopyButton text={workspace.id} label="Workspace ID" />
                                    </div>

                                    <form onSubmit={handleInvite} className="space-y-4 py-2">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Email address</label>
                                            <Input
                                                placeholder="user@example.com"
                                                type="email"
                                                value={inviteEmail}
                                                onChange={e => setInviteEmail(e.target.value)}
                                                className="bg-background border-border"
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Role</label>
                                            <Select value={inviteRole} onValueChange={setInviteRole}>
                                                <SelectTrigger className="bg-background border-border">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-background border-border">
                                                    <SelectItem value="ADMIN">Admin – invite users, approve requests</SelectItem>
                                                    <SelectItem value="EDITOR">Editor – edit code, create files</SelectItem>
                                                    <SelectItem value="VIEWER">Viewer – read-only</SelectItem>
                                                    <SelectItem value="VISITOR">Visitor – 2-hour temporary</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button type="submit" disabled={inviting} className="w-full bg-teal-500 hover:bg-teal-600">
                                            {inviting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : "Send Invitation"}
                                        </Button>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Main content ───────────────────────────────────────────────────── */}
            <main className="flex-1 relative z-10 p-6 md:p-8 overflow-y-auto">
                <div className="max-w-7xl mx-auto">
                    <Tabs defaultValue="overview" className="space-y-6">
                        <TabsList className="bg-muted/50 border border-border p-1">
                            <TabsTrigger value="overview" className="data-[state=active]:bg-teal-500 data-[state=active]:text-foreground">Overview</TabsTrigger>
                            <TabsTrigger value="members" className="data-[state=active]:bg-teal-500 data-[state=active]:text-foreground">Members</TabsTrigger>
                            {isOwnerOrAdmin && (
                                <TabsTrigger value="requests" className="data-[state=active]:bg-teal-500 data-[state=active]:text-foreground relative" onClick={fetchJoinRequests}>
                                    Join Requests
                                    {joinRequests.length > 0 && (
                                        <span className="absolute -top-1 -right-1 h-4 w-4 bg-orange-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                            {joinRequests.length}
                                        </span>
                                    )}
                                </TabsTrigger>
                            )}
                            {isOwnerOrAdmin && (
                                <TabsTrigger value="settings" className="data-[state=active]:bg-teal-500 data-[state=active]:text-foreground">Settings</TabsTrigger>
                            )}
                        </TabsList>

                        {/* ── Overview Tab ─────────────────────────────────────────────── */}
                        <TabsContent value="overview" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">

                            {/* Visitor session banner */}
                            {sessionInfo?.hasSession && sessionInfo?.active && !canEdit && (
                                <div className="rounded-lg bg-orange-500/10 border border-orange-500/30 p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Clock className="h-5 w-5 text-orange-400 shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium text-orange-300">Visitor Session Active</p>
                                            <p className="text-xs text-muted-foreground">
                                                You have {Math.max(0, Math.ceil((new Date(sessionInfo.expiresAt).getTime() - Date.now()) / 60000))} minutes left. Read-only after expiry.
                                            </p>
                                        </div>
                                    </div>
                                    <Button size="sm" variant="outline" className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10" onClick={handleRequestAccess}>
                                        Request Full Access
                                    </Button>
                                </div>
                            )}

                            {/* Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <Card className="bg-card border-border backdrop-blur-md">
                                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Files</CardTitle></CardHeader>
                                    <CardContent><div className="text-2xl font-bold">{files.length}</div></CardContent>
                                </Card>
                                <Card className="bg-card border-border backdrop-blur-md">
                                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Collaborators</CardTitle></CardHeader>
                                    <CardContent><div className="text-2xl font-bold">{workspace.members.length}</div></CardContent>
                                </Card>
                                <Card className="bg-card border-border backdrop-blur-md">
                                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active Now</CardTitle></CardHeader>
                                    <CardContent><div className="text-2xl font-bold text-teal-400">{activeUserIds.length}</div></CardContent>
                                </Card>
                            </div>

                            {/* Workspace ID card */}
                            <Card className="bg-card border-border backdrop-blur-md">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">Workspace ID</p>
                                        <p className="text-sm font-mono text-foreground">{workspace.id}</p>
                                    </div>
                                    <CopyButton text={workspace.id} label="Workspace ID" />
                                </CardContent>
                            </Card>

                            {/* File browser */}
                            <Card className="bg-card border-border backdrop-blur-md overflow-hidden">
                                <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-card py-3">
                                    <div className="flex items-center gap-2">
                                        <Code className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium">Repository Files</span>
                                    </div>
                                    {canEdit && (
                                        <Button size="sm" variant="ghost" className="h-8 text-xs hover:bg-muted/50" onClick={() => navigate(`/workspace/${id}/editor`)}>
                                            <Plus className="mr-1 h-3 w-3" />New File
                                        </Button>
                                    )}
                                </CardHeader>
                                <div className="divide-y divide-border">
                                    {files.length === 0 ? (
                                        <div className="py-12 text-center">
                                            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                                            <p className="text-sm text-muted-foreground">No files yet</p>
                                            {canEdit && (
                                                <Button size="sm" className="mt-4 bg-teal-500 hover:bg-teal-600" onClick={() => navigate(`/workspace/${id}/editor`)}>
                                                    Open Editor
                                                </Button>
                                            )}
                                        </div>
                                    ) : (
                                        files.map(file => (
                                            <div key={file.id} className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer transition-colors group" onClick={() => navigate(`/workspace/${id}/editor`)}>
                                                <div className="flex items-center gap-3">
                                                    <FileText className="h-4 w-4 text-teal-500" />
                                                    <span className="text-sm font-mono">{file.name}</span>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{file.language}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </Card>

                            {/* README */}
                            <Card className="bg-card border-border backdrop-blur-md">
                                <CardHeader className="border-b border-border py-3">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium uppercase tracking-wider">README.md</span>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-6 prose max-w-none dark:prose-invert">
                                    <h1>Welcome to {workspace.name}</h1>
                                    <p>Collaborate on code in real-time with your team.</p>
                                    <h3>Getting Started</h3>
                                    <ul>
                                        <li>Click <strong>Open Editor</strong> to start coding</li>
                                        <li>Use the <strong>Invite</strong> button to add team members</li>
                                        <li>Share the <strong>Workspace ID</strong> so people can request access</li>
                                    </ul>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* ── Members Tab ──────────────────────────────────────────────── */}
                        <TabsContent value="members" className="animate-in fade-in slide-in-from-bottom-2">
                            <Card className="bg-card border-border backdrop-blur-md">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle>Team Members</CardTitle>
                                        <CardDescription>Manage who has access to this workspace.</CardDescription>
                                    </div>
                                    {isOwnerOrAdmin && (
                                        <Button size="sm" className="bg-teal-500 hover:bg-teal-600 text-white" onClick={() => setInviteOpen(true)}>
                                            <Users className="mr-2 h-4 w-4" />Invite
                                        </Button>
                                    )}
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {workspace.members.map(member => (
                                        <div key={member.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <Avatar className="h-10 w-10 border border-border">
                                                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${member.user.email}`} />
                                                        <AvatarFallback>{member.user.email[0].toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                    {activeUserIds.includes(member.userId) && (
                                                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-teal-500 border-2 border-background" />
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium">
                                                        {member.user.displayName || member.user.email}
                                                        {member.userId === user?.id && " (You)"}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <RoleBadge role={member.role} />
                                                        {activeUserIds.includes(member.userId) && <span className="text-[10px] text-teal-400">Online</span>}
                                                    </div>
                                                </div>
                                            </div>

                                            {isOwnerOrAdmin && member.userId !== user?.id && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                                            <Settings className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="bg-background/95 backdrop-blur-xl border-border">
                                                        <DropdownMenuLabel>Change Role</DropdownMenuLabel>
                                                        <DropdownMenuSeparator className="bg-border" />
                                                        {(["ADMIN", "EDITOR", "VIEWER", "VISITOR"] as Role[]).map(r => (
                                                            <DropdownMenuItem key={r} onClick={() => handleRoleChange(member.userId, r)} className="gap-2">
                                                                {ROLE_ICON[r]} Make {r}
                                                            </DropdownMenuItem>
                                                        ))}
                                                        <DropdownMenuSeparator className="bg-border" />
                                                        <DropdownMenuItem
                                                            className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
                                                            onClick={() => handleRemoveMember(member.userId)}
                                                            disabled={member.role === "OWNER"}
                                                        >
                                                            Remove from Workspace
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* ── Join Requests Tab ────────────────────────────────────────── */}
                        {isOwnerOrAdmin && (
                            <TabsContent value="requests" className="animate-in fade-in slide-in-from-bottom-2">
                                <Card className="bg-card border-border backdrop-blur-md">
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <div>
                                            <CardTitle>Join Requests</CardTitle>
                                            <CardDescription>People who want to join this workspace. Approve or reject them.</CardDescription>
                                        </div>
                                        <Button size="sm" variant="ghost" onClick={fetchJoinRequests} className="text-muted-foreground hover:text-foreground">
                                            <RefreshCw className={`h-4 w-4 ${loadingRequests ? "animate-spin" : ""}`} />
                                        </Button>
                                    </CardHeader>
                                    <CardContent>
                                        {joinRequests.length === 0 ? (
                                            <div className="text-center py-12">
                                                <UserCheck className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                                                <p className="text-sm font-medium text-foreground mb-1">No pending requests</p>
                                                <p className="text-xs text-muted-foreground">Share your workspace ID so people can request access</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {joinRequests.map(req => (
                                                    <div key={req.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
                                                        <div className="flex items-center gap-3">
                                                            <Avatar className="h-10 w-10 border border-border">
                                                                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${req.user.email}`} />
                                                                <AvatarFallback>{req.user.email[0].toUpperCase()}</AvatarFallback>
                                                            </Avatar>
                                                            <div>
                                                                <p className="text-sm font-medium">{req.user.displayName || req.user.email}</p>
                                                                <p className="text-xs text-muted-foreground">{req.user.email}</p>
                                                                {req.message && <p className="text-xs italic text-muted-foreground mt-1">"{req.message}"</p>}
                                                                <p className="text-[10px] text-muted-foreground mt-1">{new Date(req.createdAt).toLocaleString()}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button size="sm" className="bg-teal-500 hover:bg-teal-600 text-white" onClick={() => handleApproveRequest(req.id)}>
                                                                <UserCheck className="mr-1 h-3.5 w-3.5" />Approve
                                                            </Button>
                                                            <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10" onClick={() => handleRejectRequest(req.id)}>
                                                                <UserX className="mr-1 h-3.5 w-3.5" />Reject
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        )}

                        {/* ── Settings Tab ─────────────────────────────────────────────── */}
                        {isOwnerOrAdmin && (
                            <TabsContent value="settings" className="animate-in fade-in slide-in-from-bottom-2">
                                <div className="space-y-6">
                                    {/* Workspace Info */}
                                    <Card className="bg-card border-border backdrop-blur-md">
                                        <CardHeader>
                                            <CardTitle>Workspace Settings</CardTitle>
                                            <CardDescription>Manage workspace preferences.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-6">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Workspace Name</label>
                                                <div className="flex gap-2">
                                                    <Input value={newName} onChange={e => setNewName(e.target.value)} className="bg-background border-border" />
                                                    <Button onClick={handleUpdateName} className="bg-teal-500 hover:bg-teal-600">Save</Button>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">Workspace ID</label>
                                                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border">
                                                    <p className="text-sm font-mono flex-1 break-all">{workspace.id}</p>
                                                    <CopyButton text={workspace.id} label="Workspace ID" />
                                                </div>
                                                <p className="text-xs text-muted-foreground">Share this ID so people can request access to join</p>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Role legend */}
                                    <Card className="bg-card border-border backdrop-blur-md">
                                        <CardHeader>
                                            <CardTitle>Role Permissions</CardTitle>
                                            <CardDescription>Overview of what each role can do.</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-3">
                                                {([
                                                    ["OWNER", "Full access. Can delete workspace and manage all roles."],
                                                    ["ADMIN", "Can invite users, approve join requests, and manage members."],
                                                    ["EDITOR", "Can edit code, create and delete files."],
                                                    ["MEMBER", "Standard access. Can edit code."],
                                                    ["VIEWER", "Read-only. Cannot edit files."],
                                                    ["VISITOR", "2-hour temporary access. Cannot edit."],
                                                ] as [Role, string][]).map(([role, desc]) => (
                                                    <div key={role} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30">
                                                        <RoleBadge role={role} />
                                                        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Danger zone */}
                                    <Card className="bg-card border-border backdrop-blur-md">
                                        <CardHeader>
                                            <CardTitle className="text-red-400 flex items-center gap-2">
                                                <ShieldAlert className="h-4 w-4" />Danger Zone
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/5 flex items-center justify-between">
                                                <div>
                                                    <p className="text-foreground font-medium">Delete this workspace</p>
                                                    <p className="text-sm text-muted-foreground">Once deleted, it cannot be recovered.</p>
                                                </div>
                                                <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="destructive" className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20">
                                                            <Trash2 className="mr-2 h-4 w-4" />Delete
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="bg-background/95 backdrop-blur-2xl border-border">
                                                        <DialogHeader>
                                                            <DialogTitle className="text-red-500">Delete Workspace?</DialogTitle>
                                                            <DialogDescription>
                                                                This will permanently delete <strong>{workspace.name}</strong> and remove all member access.
                                                            </DialogDescription>
                                                        </DialogHeader>
                                                        <DialogFooter>
                                                            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                                                            <Button variant="destructive" onClick={handleDeleteWorkspace}>Yes, Delete</Button>
                                                        </DialogFooter>
                                                    </DialogContent>
                                                </Dialog>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </TabsContent>
                        )}
                    </Tabs>
                </div>
            </main>
        </div>
    );
}

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RotateCcw, Eye, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface Version {
    id: string;
    createdAt: string;
    createdBy: string | null;
    // We might not fetch content for the list to save bandwidth, but for now let's assume we do or fetch on demand
    content?: string; 
}

interface VersionHistoryProps {
    fileId: string | null;
    open: boolean;
    onClose: () => void;
    onRestore: (versionId: string) => Promise<void>;
}

export default function VersionHistory({ fileId, open, onClose, onRestore }: VersionHistoryProps) {
    const [versions, setVersions] = useState<Version[]>([]);
    const [loading, setLoading] = useState(false);
    const [previewVersion, setPreviewVersion] = useState<Version | null>(null);
    const [confirmRestore, setConfirmRestore] = useState<string | null>(null); // versionId to restore
    const [restoring, setRestoring] = useState(false);

    useEffect(() => {
        if (open && fileId) {
            setLoading(true);
            api.files.getVersions(fileId)
                .then(setVersions)
                .catch(err => {
                    console.error(err);
                    toast({ variant: "destructive", title: "Error", description: "Failed to load version history" });
                })
                .finally(() => setLoading(false));
        }
    }, [open, fileId]);

    const handleRestore = async () => {
        if (!confirmRestore) return;
        setRestoring(true);
        try {
            await onRestore(confirmRestore);
            setConfirmRestore(null);
            onClose();
            toast({ title: "Success", description: "Version restored successfully" });
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Error", description: "Failed to restore version" });
        } finally {
            setRestoring(false);
        }
    };

    const handlePreview = async (version: Version) => {
        // If content is missing in the list, we might need to fetch it individually
        // But for now, assuming the API returns it or we can fetch it.
        // Let's assume we need to fetch individual version content if it's large, 
        // but based on previous summary, GET /api/files/:id/versions might just list them.
        // Let's check api.ts later. For now, let's assume we fetch it.
        try {
            const fullVersion = await api.files.getVersion(version.id);
            setPreviewVersion(fullVersion);
        } catch (err) {
            toast({ variant: "destructive", title: "Error", description: "Failed to load version content" });
        }
    };

    return (
        <>
            <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
                <SheetContent className="w-[400px] sm:w-[540px] flex flex-col gap-0 p-0 bg-background border-l border-border">
                    <SheetHeader className="p-6 border-b border-border">
                        <SheetTitle>Version History</SheetTitle>
                        <SheetDescription>
                            View and restore previous versions of this file.
                        </SheetDescription>
                    </SheetHeader>
                    
                    <ScrollArea className="flex-1 p-6">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : versions.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No history available for this file.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {versions.map((version) => (
                                    <div key={version.id} className="flex flex-col gap-2 p-4 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">
                                                {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
                                            </span>
                                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                                {version.createdBy || "Unknown"}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Button variant="outline" size="sm" className="h-8 gap-1.5 flex-1" onClick={() => handlePreview(version)}>
                                                <Eye className="h-3.5 w-3.5" />
                                                Preview
                                            </Button>
                                            <Button variant="default" size="sm" className="h-8 gap-1.5 flex-1" onClick={() => setConfirmRestore(version.id)}>
                                                <RotateCcw className="h-3.5 w-3.5" />
                                                Restore
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </SheetContent>
            </Sheet>

            {/* Preview Dialog */}
            <Dialog open={!!previewVersion} onOpenChange={(o) => !o && setPreviewVersion(null)}>
                <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col bg-background border-border">
                    <DialogHeader>
                        <DialogTitle>Version Preview</DialogTitle>
                        <DialogDescription>
                            {previewVersion && formatDistanceToNow(new Date(previewVersion.createdAt), { addSuffix: true })}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-hidden rounded-md border border-border bg-muted/30 p-4 font-mono text-xs overflow-y-auto whitespace-pre-wrap">
                        {previewVersion?.content}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPreviewVersion(null)}>Close</Button>
                        <Button onClick={() => {
                            if (previewVersion) {
                                setPreviewVersion(null);
                                setConfirmRestore(previewVersion.id);
                            }
                        }}>Restore This Version</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Restore Confirmation Dialog */}
            <Dialog open={!!confirmRestore} onOpenChange={(o) => !o && setConfirmRestore(null)}>
                <DialogContent className="bg-background border-border">
                    <DialogHeader>
                        <DialogTitle>Restore Version?</DialogTitle>
                        <DialogDescription>
                            This will create a new version with the content from the selected point in history. Your current work will be saved as a new version before restoring.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmRestore(null)} disabled={restoring}>Cancel</Button>
                        <Button onClick={handleRestore} disabled={restoring}>
                            {restoring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm Restore
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

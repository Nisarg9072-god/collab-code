import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/UI/dialog";
import { Button } from "@/components/UI/button";

export default function UsageLimitDialog() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.id || "anon";
  const [open, setOpen] = useState(false);
  const shownKey = `cc.popup.shown.${uid}`;

  useEffect(() => {
    const check = () => {
      const dayKey = new Date().toISOString().slice(0, 10);
      const lockKey = `cc.usage.locked.${uid}.${dayKey}`;
      const isLocked = localStorage.getItem(lockKey) === "true";
      const already = sessionStorage.getItem(shownKey) === "true";
      if (isLocked && !already) {
        setOpen(true);
        sessionStorage.setItem(shownKey, "true");
      }
    };
    check();
    const intId = window.setInterval(check, 3000);
    return () => clearInterval(intId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-background border-border">
        <DialogHeader>
          <DialogTitle>Usage Limit Reached</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>You have reached your daily usage limit.</p>
          <p>Upgrade your plan to continue working.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button onClick={() => navigate("/pricing")}>Upgrade</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

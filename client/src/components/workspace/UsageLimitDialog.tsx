import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/UI/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

function getUserId(): string {
  try {
    const demo = sessionStorage.getItem("cc.demo") === "true" || localStorage.getItem("demoMode") === "true";
    if (demo) return "demo-user";
    const uid = localStorage.getItem("cc.user.id");
    return uid || "anon";
  } catch {
    return "anon";
  }
}

function isDemo(): boolean {
  return sessionStorage.getItem("cc.demo") === "true" || localStorage.getItem("demoMode") === "true";
}

export default function UsageLimitDialog() {
  const navigate = useNavigate();
  const uid = useMemo(getUserId, []);
  const [open, setOpen] = useState(false);
  const [isDemoUser, setIsDemoUser] = useState(false);
  const shownKey = `cc.popup.shown.${uid}`;

  useEffect(() => {
    const check = () => {
      const dayKey = new Date().toISOString().slice(0, 10);
      const lockKey = `cc.usage.locked.${uid}.${dayKey}`;
      const isLocked = localStorage.getItem(lockKey) === "true";
      const already = sessionStorage.getItem(shownKey) === "true";
      if (isLocked && !already) {
        setIsDemoUser(isDemo());
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
          <DialogTitle>{isDemoUser ? "Demo Limit Reached" : "Usage Limit Reached"}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground space-y-2">
          {isDemoUser ? (
            <>
              <p>You have reached the 2-hour demo limit.</p>
              <p>Login or upgrade to continue.</p>
            </>
          ) : (
            <>
              <p>You have reached your daily usage limit.</p>
              <p>Upgrade your plan to continue working.</p>
            </>
          )}
        </div>
        <DialogFooter className="gap-2">
          {isDemoUser ? (
            <>
              <Button
                onClick={() => {
                  sessionStorage.setItem("cc.redirectAfterLogin", "/pricing");
                  navigate("/login");
                }}
              >
                Login
              </Button>
              <Button variant="secondary" onClick={() => navigate("/pricing")}>
                Upgrade
              </Button>
            </>
          ) : (
            <Button onClick={() => navigate("/pricing")}>Upgrade</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

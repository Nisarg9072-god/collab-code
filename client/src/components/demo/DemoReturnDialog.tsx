import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/UI/dialog";
import { Button } from "@/components/ui/button";

const DEMO_PREFIX = "cc.demo.ws.";
const LAST_SEEN_KEY = "cc.demo.lastSeenAt";

function isDemoActive() {
  try {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    return sp.get("demo") === "true" || sessionStorage.getItem("cc.demo") === "true" || localStorage.getItem("demoMode") === "true";
  } catch {
    return false;
  }
}

function hasAnyDemoFiles(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || "";
      if (key.startsWith(DEMO_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length > 0) return true;
        } catch {
          // ignore parse errors
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

function clearDemoFiles() {
  if (typeof window === "undefined") return;
  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) || "";
    if (key.startsWith(DEMO_PREFIX)) toDelete.push(key);
  }
  toDelete.forEach((k) => localStorage.removeItem(k));
}

export default function DemoReturnDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const shouldPrompt = useMemo(() => {
    if (!isDemoActive()) return false;
    const lastSeenRaw = localStorage.getItem(LAST_SEEN_KEY);
    if (!lastSeenRaw) return false;
    const lastSeen = parseInt(lastSeenRaw, 10);
    if (Number.isNaN(lastSeen)) return false;
    const elapsed = Date.now() - lastSeen;
    return elapsed > 24 * 60 * 60 * 1000 && hasAnyDemoFiles();
  }, []);

  useEffect(() => {
    if (isDemoActive()) {
      if (shouldPrompt) {
        setOpen(true);
      } else {
        localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isDemoActive()) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-background border-border">
        <DialogHeader>
          <DialogTitle>Welcome back to Demo</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>You previously used the demo workspace.</p>
          <p>
            Login to save your previous work permanently,
            or continue demo without saving previous data.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button
            onClick={() => {
              // keep data, go to login
              navigate("/login");
            }}
          >
            Login
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              clearDemoFiles();
              localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
              setOpen(false);
            }}
          >
            Continue Demo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const API_URL = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE || "http://localhost:5000/api";
const isDemo = () => {
  if (typeof window === "undefined") return false;
  const sp = new URLSearchParams(window.location.search);
  return sp.get("demo") === "true" || sessionStorage.getItem("cc.demo") === "true" || localStorage.getItem("demoMode") === "true";
};
const uuid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
};
const demoKey = (k: string) => `cc.demo.${k}`;
const ensureDemoWorkspace = (id: string) => {
  const k = demoKey(`ws.${id}.files`);
  const raw = localStorage.getItem(k);
  if (!raw) {
    const now = new Date().toISOString();
    const f1 = { id: uuid(), name: "main.ts", language: "TypeScript", content: "function greet(name: string) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet('World'));\n", updatedAt: now };
    const f2 = { id: uuid(), name: "README.md", language: "Markdown", content: "# CollabCode Demo\n\nThis is a local demo workspace. Create files, edit code, and explore the UI.\n", updatedAt: now };
    localStorage.setItem(k, JSON.stringify([f1, f2]));
  }
};
const getDemoFiles = (id: string) => {
  ensureDemoWorkspace(id);
  const k = demoKey(`ws.${id}.files`);
  const arr = JSON.parse(localStorage.getItem(k) || "[]");
  return arr;
};
const setDemoFiles = (id: string, files: any[]) => {
  const k = demoKey(`ws.${id}.files`);
  localStorage.setItem(k, JSON.stringify(files));
};
const API_URL =
  (import.meta as any).env?.VITE_API_URL ||
  (import.meta as any).env?.VITE_API_BASE ||
  "http://localhost:3001/api";

/**
 * safeFetch — all backend responses are { success, data? } or { success, error }
 * We unwrap the `data` field so callers get the payload directly.
 */
const safeFetch = async (url: string, options?: RequestInit) => {
  try {
    if (isDemo()) {
      throw new Error("Demo mode fetch disabled");
    }
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      if (url.includes("/health/")) return null;
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      return null;
    }

    const body = await response.json();

    if (!response.ok) {
      const errorMsg =
        body?.error ||
        body?.message ||
        body?.detail ||
        `Request failed with status ${response.status}`;
      throw new Error(errorMsg);
    }

    // Unwrap { success: true, data: {...} }
    if (body && typeof body === "object" && "success" in body) {
      return body.data !== undefined ? body.data : body;
    }
    return body;
  } catch (err: any) {
    if (url.includes("/health/")) {
      console.warn(`[Health Check] ${url}:`, err?.message);
      return null;
    }
    console.error(`[API Error] ${url}:`, err?.message || err);
    throw err;
  }
};

const getToken = () => localStorage.getItem("token");
const authHeader = () => ({ Authorization: `Bearer ${getToken()}` });
const jsonHeaders = () => ({ "Content-Type": "application/json", ...authHeader() });

export const api = {
  billing: {
    createOrder: async (plan: "PRO" | "PREMIUM" | "ULTRA") => {
      // Allow order creation only if not in demo mode and plan is payable
      const url = `${API_URL}/create-order`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create order");
      return data;
    }
  },
  auth: {
    login: async (credentials: any) => {
      if (isDemo()) {
        return { token: "demo-token" };
      }
      return safeFetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
    },
    register: async (credentials: any) => {
      if (isDemo()) {
        return { token: "demo-token" };
      }
      return safeFetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
    },
    me: async () => {
      if (isDemo()) {
        return { id: "demo-user", email: "demo@local" };
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    login: async (credentials: { email: string; password: string }) =>
      safeFetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) }),
    register: async (credentials: { email: string; password: string; display_name?: string | null }) =>
      safeFetch(`${API_URL}/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) }),
    me: async () => safeFetch(`${API_URL}/auth/me`, { headers: authHeader() }),
  },


  workspaces: {
    list: async () => {
      if (isDemo()) {
        return [{ id: "demo", name: "Demo Workspace", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ownerId: "demo-user", members: [{ userId: "demo-user", role: "OWNER" }] }];
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    create: async (name: string) => {
      if (isDemo()) {
        return { id: "demo", name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ownerId: "demo-user", members: [{ userId: "demo-user", role: "OWNER" }] };
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
    },
    invite: async (workspaceId: string, email: string) => {
      if (isDemo()) {
        return { message: "User added to workspace", link: `${location.origin}/workspace/${workspaceId}` };
      }
    get: async (id: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    get: async (id: string) => {
      if (isDemo()) {
        return { id, name: "Demo Workspace", owner: { id: "demo-user", email: "demo@local" }, members: [{ userId: "demo-user", role: "OWNER", user: { id: "demo-user", email: "demo@local" } }] };
      }
    update: async (id: string, name: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
    },
    delete: async (id: string) => {
      if (isDemo()) {
        return { message: "Workspace deleted" };
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    join: async (workspaceId: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId }),
      });
    },
    /**
     * Invite a user to the workspace by email.
     * If the user has an account → they are added immediately.
     * If they don't → a pending invitation is created and they join on registration.
     */
    invite: async (workspaceId: string, email: string, role: string = "EDITOR") => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, role }),
      });
    },
    getMembers: async (workspaceId: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    removeMember: async (workspaceId: string, userId: string) => {
      if (isDemo()) {
        return { message: "Member removed" };
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/members/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    updateRole: async (workspaceId: string, userId: string, role: string) => {
      if (isDemo()) {
        return { id: "demo", role, user: { id: userId, email: "demo@local" } };
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role }),
      });
    },
    join: async (workspaceId: string) => {
      if (isDemo()) {
        return { message: "Joined workspace", workspaceId };
      }
    getInvitations: async (workspaceId: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/invitations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    update: async (id: string, name: string) => {
        if (isDemo()) {
          return { id, name };
        }
        const token = localStorage.getItem("token");
        return safeFetch(`${API_URL}/workspaces/${id}`, {
            method: "PATCH",
            headers: { 
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}` 
            },
            body: JSON.stringify({ name }),
        });
    },
    enterPresence: async (id: string) => {
        if (isDemo()) return;
        const token = localStorage.getItem("token");
        return fetch(`${API_URL}/workspaces/${id}/presence/enter`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
    },
    leavePresence: async (id: string) => {
        if (isDemo()) return;
        const token = localStorage.getItem("token");
        return fetch(`${API_URL}/workspaces/${id}/presence/leave`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
    },
    getPresence: async (id: string) => {
        if (isDemo()) {
          return { activeUsers: ["demo-user"] };
        }
        const token = localStorage.getItem("token");
        return safeFetch(`${API_URL}/workspaces/${id}/presence`, {
            headers: { Authorization: `Bearer ${token}` }
        });
    cancelInvitation: async (workspaceId: string, inviteId: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/invitations/${inviteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enterPresence: async (id: string) => {
      const token = localStorage.getItem("token");
      return fetch(`${API_URL}/workspaces/${id}/presence/enter`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
    },
    leavePresence: async (id: string) => {
      const token = localStorage.getItem("token");
      return fetch(`${API_URL}/workspaces/${id}/presence/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
    },
    getPresence: async (id: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${id}/presence`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    export: async (id: string) => {
      if (isDemo()) {
        const files = getDemoFiles(id);
        const content = JSON.stringify(files, null, 2);
        return new Blob([content], { type: "application/json" });
      }
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/workspaces/${id}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || "Export not available");
      }
      return response.blob();
    },
    activity: async (id: string) => {
      if (isDemo()) {
        const now = new Date().toISOString();
        return [
          { id: uuid(), actionType: "FILE_CREATED", metadata: { fileName: "main.ts" }, createdAt: now, user: { id: "demo-user", email: "demo@local" } },
        ];
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${id}/activity`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  },

  files: {
    list: async (workspaceId: string) => {
      if (isDemo()) {
        const files = getDemoFiles(workspaceId);
        return files.map((f: any) => ({ id: f.id, name: f.name, language: f.language, updatedAt: f.updatedAt }));
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    create: async (workspaceId: string, name: string, content: string = "", language: string = "plaintext") => {
      if (isDemo()) {
        const files = getDemoFiles(workspaceId);
        const f = { id: uuid(), name, content: content || "", language: language || "plaintext", updatedAt: new Date().toISOString() };
        const next = [...files, f];
        setDemoFiles(workspaceId, next);
        return { id: f.id, name: f.name, content: f.content, language: f.language, updatedAt: f.updatedAt, workspaceId };
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, content, language }),
      });
    },
    get: async (fileId: string) => {
      if (isDemo()) {
        const ids = Object.keys(localStorage).filter(k => k.startsWith(demoKey("ws.")));
        for (const k of ids) {
          const wsFiles = JSON.parse(localStorage.getItem(k) || "[]");
          const found = wsFiles.find((f: any) => f.id === fileId);
          if (found) {
            const wsId = k.split(".")[3];
            return { ...found, workspaceId: wsId };
          }
        }
        throw new Error("File not found");
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/files/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    update: async (fileId: string, updates: { content?: string, name?: string, language?: string }) => {
      if (isDemo()) {
        const ids = Object.keys(localStorage).filter(k => k.startsWith(demoKey("ws.")));
        for (const k of ids) {
          const wsFiles = JSON.parse(localStorage.getItem(k) || "[]");
          const idx = wsFiles.findIndex((f: any) => f.id === fileId);
          if (idx !== -1) {
            wsFiles[idx] = { ...wsFiles[idx], ...updates, updatedAt: new Date().toISOString() };
            localStorage.setItem(k, JSON.stringify(wsFiles));
            return wsFiles[idx];
          }
        }
        throw new Error("File not found");
      }
    update: async (fileId: string, updates: { content?: string; name?: string; language?: string }) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/files/${fileId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(updates),
      });
    },
    delete: async (fileId: string) => {
        if (isDemo()) {
          const ids = Object.keys(localStorage).filter(k => k.startsWith(demoKey("ws.")));
          for (const k of ids) {
            const wsFiles = JSON.parse(localStorage.getItem(k) || "[]");
            const next = wsFiles.filter((f: any) => f.id !== fileId);
            localStorage.setItem(k, JSON.stringify(next));
          }
          return { message: "File deleted" };
        }
        const token = localStorage.getItem("token");
        return safeFetch(`${API_URL}/files/${fileId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    getVersions: async (fileId: string) => {
      if (isDemo()) {
        return [];
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/files/${fileId}/versions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    getVersion: async (versionId: string) => {
      if (isDemo()) {
        return null;
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/file-versions/${versionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    restore: async (fileId: string, versionId: string) => {
      if (isDemo()) {
        return null;
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/files/${fileId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ versionId }),
      });
    },
  },

  /** My received invitations (logged-in user) */
  invitations: {
    list: () => safeFetch(`${API_URL}/invitations`, { headers: authHeader() }),
    accept: (inviteId: string) =>
      safeFetch(`${API_URL}/invitations/${inviteId}/accept`, { method: "POST", headers: authHeader() }),
    reject: (inviteId: string) =>
      safeFetch(`${API_URL}/invitations/${inviteId}/reject`, { method: "POST", headers: authHeader() }),
  },

  /** Join request system */
  joinRequests: {
    request: (workspaceId: string, message?: string) =>
      safeFetch(`${API_URL}/workspaces/request-access`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ workspaceId, message }),
      }),
    list: (workspaceId: string) =>
      safeFetch(`${API_URL}/workspaces/${workspaceId}/requests`, { headers: authHeader() }),
    approve: (requestId: string, role?: string) =>
      safeFetch(`${API_URL}/requests/${requestId}/approve`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ role }),
      }),
    reject: (requestId: string) =>
      safeFetch(`${API_URL}/requests/${requestId}/reject`, { method: "POST", headers: authHeader() }),
  },

  /** Visitor sessions (2-hour time-limited access) */
  sessions: {
    get: (workspaceId: string) =>
      safeFetch(`${API_URL}/workspaces/${workspaceId}/session`, { headers: authHeader() }),
    start: (workspaceId: string) =>
      safeFetch(`${API_URL}/workspaces/${workspaceId}/session/start`, { method: "POST", headers: authHeader() }),
  },

  health: {
    checkDb: async () => {
      if (isDemo()) return null;
      return safeFetch(`${API_URL}/health/db`);
    },
    checkUsers: async () => {
      if (isDemo()) return null;
      return safeFetch(`${API_URL}/health/users`);
    },
    checkDb: async () => safeFetch(`${API_URL}/health/db`),
    checkUsers: async () => safeFetch(`${API_URL}/health/users`),
  },

  runner: {
    runFile: async (fileId: string, language?: string, stdin?: string) => {
      if (isDemo()) {
        return { stdout: "", stderr: "Runner not available in demo", exitCode: -1, durationMs: 0 };
      }
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/run`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ fileId, language, stdin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to run code");
      return data?.data || data;
    },
    runJudge0: async (source_code: string, language_id: number, stdin?: string, fileId?: string) => {
      if (isDemo()) {
        return { stdout: "", stderr: "Judge0 not available in demo", exitCode: -1, durationMs: 0 };
      }
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/judge0/run`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ source_code, language_id, stdin, fileId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to run via Judge0");
      return data?.data || data;
    },
  },
};

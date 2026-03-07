const API_URL = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_API_BASE || "http://localhost:3001/api";

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
  return JSON.parse(localStorage.getItem(k) || "[]");
};

const setDemoFiles = (id: string, files: any[]) => {
  const k = demoKey(`ws.${id}.files`);
  localStorage.setItem(k, JSON.stringify(files));
};

const getToken = () => localStorage.getItem("token");
const authHeader = () => ({ Authorization: `Bearer ${getToken()}` });
const jsonHeaders = () => ({ "Content-Type": "application/json", ...authHeader() });

const safeFetch = async (url: string, options?: RequestInit) => {
  try {
    if (isDemo() && !url.includes("/health/")) {
      // Allow some health checks even in demo if needed, but usually we just mock
      return null;
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
      throw new Error(body?.error || body?.message || `Request failed with status ${response.status}`);
    }

    if (body && typeof body === "object" && "success" in body) {
      return body.data !== undefined ? body.data : body;
    }
    return body;
  } catch (err: any) {
    if (url.includes("/health/")) return null;
    throw err;
  }
};

export const api = {
  auth: {
    login: async (credentials: any) => {
      return safeFetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
    },
    register: async (credentials: any) => {
      return safeFetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
    },
    me: async () => {
      return safeFetch(`${API_URL}/auth/me`, { headers: authHeader() });
    }
  },

  workspaces: {
    list: async () => {
      if (isDemo()) return [{ id: "demo-ws", name: "Demo Workspace", ownerId: "demo-user", createdAt: new Date().toISOString() }];
      return safeFetch(`${API_URL}/workspaces`, { headers: authHeader() });
    },
    create: async (name: string) => {
      return safeFetch(`${API_URL}/workspaces`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ name }),
      });
    },
    get: async (id: string) => {
      if (isDemo()) return { id, name: "Demo Workspace", owner: { id: "demo-user", email: "demo@local" }, members: [] };
      return safeFetch(`${API_URL}/workspaces/${id}`, { headers: authHeader() });
    },
    update: async (id: string, name: string) => {
      return safeFetch(`${API_URL}/workspaces/${id}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ name }),
      });
    },
    delete: async (id: string) => {
      return safeFetch(`${API_URL}/workspaces/${id}`, {
        method: "DELETE",
        headers: authHeader(),
      });
    },
    join: async (workspaceId: string) => {
      return safeFetch(`${API_URL}/workspaces/join`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ workspaceId }),
      });
    },
    invite: async (workspaceId: string, email: string, role: string = "EDITOR") => {
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/invite`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ email, role }),
      });
    },
    getMembers: async (workspaceId: string) => {
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/members`, { headers: authHeader() });
    },
    removeMember: async (workspaceId: string, userId: string) => {
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/members/${userId}`, {
        method: "DELETE",
        headers: authHeader(),
      });
    },
    updateRole: async (workspaceId: string, userId: string, role: string) => {
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/members/${userId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ role }),
      });
    },
    getInvitations: async (workspaceId: string) => {
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/invitations`, { headers: authHeader() });
    },
    cancelInvitation: async (workspaceId: string, inviteId: string) => {
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/invitations/${inviteId}`, {
        method: "DELETE",
        headers: authHeader(),
      });
    },
    enterPresence: async (id: string) => {
      return fetch(`${API_URL}/workspaces/${id}/presence/enter`, {
        method: "POST",
        headers: authHeader(),
      }).catch(() => null);
    },
    leavePresence: async (id: string) => {
      return fetch(`${API_URL}/workspaces/${id}/presence/leave`, {
        method: "POST",
        headers: authHeader(),
      }).catch(() => null);
    },
    getPresence: async (id: string) => {
      return safeFetch(`${API_URL}/workspaces/${id}/presence`, { headers: authHeader() });
    },
    export: async (id: string) => {
      if (isDemo()) {
        const files = getDemoFiles(id);
        return new Blob([JSON.stringify(files, null, 2)], { type: "application/json" });
      }
      const response = await fetch(`${API_URL}/workspaces/${id}/export`, { headers: authHeader() });
      if (!response.ok) throw new Error("Export failed");
      return response.blob();
    },
    activity: async (id: string) => {
      if (isDemo()) return [];
      return safeFetch(`${API_URL}/workspaces/${id}/activity`, { headers: authHeader() });
    },
    search: async (workspaceId: string, query: string) => {
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/search`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ query }),
      });
    },
    collabToken: (workspaceId: string) => safeFetch(`${API_URL}/workspaces/${workspaceId}/collab-token`, { headers: authHeader() }),
  },

  files: {
    list: async (workspaceId: string) => {
      if (isDemo()) return getDemoFiles(workspaceId);
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/files`, { headers: authHeader() });
    },
    get: async (fileId: string) => {
      if (isDemo()) {
        const ids = Object.keys(localStorage).filter(k => k.startsWith("cc.demo.ws."));
        for (const k of ids) {
          const files = JSON.parse(localStorage.getItem(k) || "[]");
          const found = files.find((f: any) => f.id === fileId);
          if (found) return found;
        }
        throw new Error("File not found");
      }
      return safeFetch(`${API_URL}/files/${fileId}`, { headers: authHeader() });
    },
    create: async (workspaceId: string, name: string, content: string = "", language: string = "plaintext") => {
      if (isDemo()) {
        const files = getDemoFiles(workspaceId);
        const f = { id: uuid(), name, content, language, updatedAt: new Date().toISOString() };
        setDemoFiles(workspaceId, [...files, f]);
        return f;
      }
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/files`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ name, content, language }),
      });
    },
    update: async (fileId: string, contentOrMeta: string | { content?: string; language?: string; name?: string }) => {
      if (isDemo()) {
        const ids = Object.keys(localStorage).filter(k => k.startsWith("cc.demo.ws."));
        for (const k of ids) {
          const files = JSON.parse(localStorage.getItem(k) || "[]");
          const idx = files.findIndex((f: any) => f.id === fileId);
          if (idx !== -1) {
            if (typeof contentOrMeta === "string") {
              files[idx].content = contentOrMeta;
            } else {
              Object.assign(files[idx], contentOrMeta);
            }
            files[idx].updatedAt = new Date().toISOString();
            localStorage.setItem(k, JSON.stringify(files));
            return files[idx];
          }
        }
        throw new Error("File not found");
      }
      const body = typeof contentOrMeta === "string" ? { content: contentOrMeta } : contentOrMeta;
      return safeFetch(`${API_URL}/files/${fileId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });
    },
    delete: async (fileId: string) => {
      if (isDemo()) {
        const ids = Object.keys(localStorage).filter(k => k.startsWith("cc.demo.ws."));
        for (const k of ids) {
          const files = JSON.parse(localStorage.getItem(k) || "[]");
          const next = files.filter((f: any) => f.id !== fileId);
          if (next.length !== files.length) {
            localStorage.setItem(k, JSON.stringify(next));
            return { success: true };
          }
        }
        return { success: true };
      }
      return safeFetch(`${API_URL}/files/${fileId}`, {
        method: "DELETE",
        headers: authHeader(),
      });
    },
    restore: async (fileId: string, versionId: string) => {
      return safeFetch(`${API_URL}/files/${fileId}/restore`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ versionId }),
      });
    }
  },

  runner: {
    runJudge0: async (source_code: string, language_id: number, stdin?: string, fileId?: string) => {
      if (isDemo()) return { stdout: "Judge0 not available in demo", stderr: "", exitCode: 0, durationMs: 0 };
      return safeFetch(`${API_URL}/judge0/run`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ source_code, language_id, stdin, fileId }),
      });
    },
    runFile: async (fileId: string, language: string, stdin?: string) => {
      if (isDemo()) return { stdout: "Runner not available in demo", stderr: "", exitCode: 0, durationMs: 0 };
      return safeFetch(`${API_URL}/runner/run`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ fileId, language, stdin }),
      });
    }
  },

  invitations: {
    list: () => safeFetch(`${API_URL}/invitations`, { headers: authHeader() }),
    accept: (inviteId: string) => safeFetch(`${API_URL}/invitations/${inviteId}/accept`, { method: "POST", headers: authHeader() }),
    reject: (inviteId: string) => safeFetch(`${API_URL}/invitations/${inviteId}/reject`, { method: "POST", headers: authHeader() }),
  },

  joinRequests: {
    request: (workspaceId: string, message?: string) =>
      safeFetch(`${API_URL}/workspaces/request-access`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ workspaceId, message }),
      }),
    list: (workspaceId: string) => safeFetch(`${API_URL}/workspaces/${workspaceId}/requests`, { headers: authHeader() }),
    approve: (requestId: string, role?: string) =>
      safeFetch(`${API_URL}/requests/${requestId}/approve`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ role }),
      }),
    reject: (requestId: string) => safeFetch(`${API_URL}/requests/${requestId}/reject`, { method: "POST", headers: authHeader() }),
  },

  git: {
    status: (workspaceId: string) => safeFetch(`${API_URL}/workspaces/${workspaceId}/git/status`, { headers: authHeader() }),
    diff: (workspaceId: string, fileName: string) => safeFetch(`${API_URL}/workspaces/${workspaceId}/git/diff/${fileName}`, { headers: authHeader() }),
    add: (workspaceId: string, files: string[]) => safeFetch(`${API_URL}/workspaces/${workspaceId}/git/add`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ files }),
    }),
    commit: (workspaceId: string, message: string) => safeFetch(`${API_URL}/workspaces/${workspaceId}/git/commit`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ message }),
    }),
    log: (workspaceId: string) => safeFetch(`${API_URL}/workspaces/${workspaceId}/git/log`, { headers: authHeader() }),
  },

  payment: {
    createOrder: (plan: string) => safeFetch(`${API_URL}/payment/create-order`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ plan }),
    }),
    verify: (paymentData: any) => safeFetch(`${API_URL}/payment/verify`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(paymentData),
    }),
  },

  health: {
    db: () => safeFetch(`${API_URL}/health/db`),
  },
  usage: {
    status: () => safeFetch(`${API_URL}/usage/status`, { headers: authHeader() }),
    report: (workspaceId: string, seconds: number) => safeFetch(`${API_URL}/usage/report`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ workspaceId, seconds }),
    }),
  }
};

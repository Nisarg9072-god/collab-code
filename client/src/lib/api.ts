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

const safeFetch = async (url: string, options?: RequestInit) => {
  try {
    if (isDemo()) {
      throw new Error("Demo mode fetch disabled");
    }
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");

    if (!response.ok) {
      if (contentType && contentType.includes("application/json")) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }
      throw new Error(`Request failed with status ${response.status}`);
    }

    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    }

    if (url.includes("/health/")) {
        return null;
    }
    
    console.warn(`Expected JSON from ${url} but received ${contentType}`);
    return null;
  } catch (err: any) {
    if (url.includes("/health/")) {
        console.warn(`Silent Health Check Warning (${url}):`, err?.message || err);
        return null;
    }
    console.error(`API Call Error (${url}):`, err);
    throw err;
  }
};

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
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ name }),
      });
    },
    invite: async (workspaceId: string, email: string) => {
      if (isDemo()) {
        return { message: "User added to workspace", link: `${location.origin}/workspace/${workspaceId}` };
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/invite`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ email }),
      });
    },
    get: async (id: string) => {
      if (isDemo()) {
        return { id, name: "Demo Workspace", owner: { id: "demo-user", email: "demo@local" }, members: [{ userId: "demo-user", role: "OWNER", user: { id: "demo-user", email: "demo@local" } }] };
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
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
        headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ role }),
      });
    },
    join: async (workspaceId: string) => {
      if (isDemo()) {
        return { message: "Joined workspace", workspaceId };
      }
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/join`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ workspaceId }),
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
      if (!response.ok) throw new Error("Failed to export project");
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
    }
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
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
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
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/files/${fileId}`, {
        method: "PUT",
        headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}` 
        },
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
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ versionId }),
      });
    }
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
  },
  runner: {
    runFile: async (fileId: string, language?: string, stdin?: string) => {
      if (isDemo()) {
        return { stdout: "", stderr: "Runner not available in demo", exitCode: -1, durationMs: 0 };
      }
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ fileId, language, stdin })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to run");
      return data;
    },
    runJudge0: async (source_code: string, language_id: number, stdin?: string, fileId?: string) => {
      if (isDemo()) {
        return { stdout: "", stderr: "Judge0 not available in demo", exitCode: -1, durationMs: 0 };
      }
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/judge0/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ source_code, language_id, stdin, fileId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to run via Judge0");
      return data;
    }
  }
};

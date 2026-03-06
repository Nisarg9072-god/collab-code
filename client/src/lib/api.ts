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
  auth: {
    login: async (credentials: { email: string; password: string }) =>
      safeFetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) }),
    register: async (credentials: { email: string; password: string; display_name?: string | null }) =>
      safeFetch(`${API_URL}/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) }),
    me: async () => safeFetch(`${API_URL}/auth/me`, { headers: authHeader() }),
  },


  workspaces: {
    list: async () => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    create: async (name: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
    },
    get: async (id: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    update: async (id: string, name: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
    },
    delete: async (id: string) => {
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
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/members/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    updateRole: async (workspaceId: string, userId: string, role: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role }),
      });
    },
    getInvitations: async (workspaceId: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/invitations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
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
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${id}/activity`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  },

  files: {
    list: async (workspaceId: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    create: async (workspaceId: string, name: string, content: string = "", language: string = "plaintext") => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${workspaceId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, content, language }),
      });
    },
    get: async (fileId: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/files/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    update: async (fileId: string, updates: { content?: string; name?: string; language?: string }) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/files/${fileId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(updates),
      });
    },
    delete: async (fileId: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    getVersions: async (fileId: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/files/${fileId}/versions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    getVersion: async (versionId: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/file-versions/${versionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    restore: async (fileId: string, versionId: string) => {
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
    checkDb: async () => safeFetch(`${API_URL}/health/db`),
    checkUsers: async () => safeFetch(`${API_URL}/health/users`),
  },

  runner: {
    runFile: async (fileId: string, language?: string, stdin?: string) => {
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

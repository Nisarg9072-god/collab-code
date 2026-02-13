<<<<<<< HEAD
const API_URL = "http://127.0.0.1:3001/api";

const safeFetch = async (url: string, options?: RequestInit) => {
  try {
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

    // If not JSON, but response was OK, return null or handle accordingly
    if (url.includes("/health/")) {
        // Silently return null for health checks if they return non-JSON (like HTML)
        return null;
    }
    
    console.warn(`Expected JSON from ${url} but received ${contentType}`);
    return null;
  } catch (err) {
    // Only log health check errors as warnings to keep console clean
    if (url.includes("/health/")) {
        console.warn(`Silent Health Check Warning (${url}):`, err.message);
        return null;
    }
    console.error(`API Call Error (${url}):`, err);
    throw err;
  }
};
=======
const API_URL = (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || "http://localhost:5000/api");
try { console.debug("API_URL:", API_URL); } catch {}
>>>>>>> 4d2bd05 (Resolved merge conflicts)

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
      return safeFetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
    },
    me: async () => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
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
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ name }),
      });
    },
    invite: async (workspaceId: string, email: string) => {
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
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    delete: async (id: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${id}`, {
        method: "DELETE",
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
        headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ role }),
      });
    },
    join: async (workspaceId: string) => {
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
        const token = localStorage.getItem("token");
        return fetch(`${API_URL}/workspaces/${id}/presence/enter`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
    },
    leavePresence: async (id: string) => {
        const token = localStorage.getItem("token");
        return fetch(`${API_URL}/workspaces/${id}/presence/leave`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
    },
    getPresence: async (id: string) => {
        const token = localStorage.getItem("token");
        return safeFetch(`${API_URL}/workspaces/${id}/presence`, {
            headers: { Authorization: `Bearer ${token}` }
        });
    },
    export: async (id: string) => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/workspaces/${id}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to export project");
      return response.blob();
    },
    activity: async (id: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/workspaces/${id}/activity`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
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
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ name, content, language }),
      });
    },
    get: async (fileId: string) => {
      const token = localStorage.getItem("token");
      return safeFetch(`${API_URL}/files/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    update: async (fileId: string, updates: { content?: string, name?: string, language?: string }) => {
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
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ versionId }),
      });
    }
<<<<<<< HEAD
  },
  health: {
    checkDb: async () => {
      return safeFetch(`${API_URL}/health/db`);
    },
    checkUsers: async () => {
      return safeFetch(`${API_URL}/health/users`);
    },
  },
=======
  }
  ,
  runner: {
    runFile: async (fileId: string, language?: string, stdin?: string) => {
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
>>>>>>> 4d2bd05 (Resolved merge conflicts)
};

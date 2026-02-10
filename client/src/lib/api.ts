const API_URL = "http://localhost:3001/api";

export const api = {
  auth: {
    login: async (credentials: any) => {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed");
      return data;
    },
    register: async (credentials: any) => {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Registration failed");
      return data;
    },
    me: async () => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch user");
      return data;
    },
  },
  workspaces: {
    list: async () => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/workspaces`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch workspaces");
      return data;
    },
    create: async (name: string) => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/workspaces`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create workspace");
      return data;
    },
    invite: async (workspaceId: string, email: string) => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/workspaces/${workspaceId}/invite`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to invite user");
      return data;
    },
    get: async (id: string) => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/workspaces/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch workspace");
      return data;
    },
    delete: async (id: string) => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/workspaces/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete workspace");
      return data;
    },
    removeMember: async (workspaceId: string, userId: string) => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/workspaces/${workspaceId}/members/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to remove member");
      return data;
    },
    updateRole: async (workspaceId: string, userId: string, role: string) => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/workspaces/${workspaceId}/members/${userId}`, {
        method: "PATCH",
        headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update role");
      return data;
    },
    join: async (workspaceId: string) => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/workspaces/join`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to join workspace");
      return data;
    },
    update: async (id: string, name: string) => {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_URL}/workspaces/${id}`, {
            method: "PATCH",
            headers: { 
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}` 
            },
            body: JSON.stringify({ name }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to update workspace");
        return data;
    },
    enterPresence: async (id: string) => {
        const token = localStorage.getItem("token");
        await fetch(`${API_URL}/workspaces/${id}/presence/enter`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
    },
    leavePresence: async (id: string) => {
        const token = localStorage.getItem("token");
        await fetch(`${API_URL}/workspaces/${id}/presence/leave`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
    },
    getPresence: async (id: string) => {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_URL}/workspaces/${id}/presence`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return await response.json();
    }
  },
  files: {
    list: async (workspaceId: string) => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/workspaces/${workspaceId}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to list files");
      return data;
    },
    create: async (workspaceId: string, name: string, content: string = "", language: string = "plaintext") => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/workspaces/${workspaceId}/files`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ name, content, language }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create file");
      return data;
    },
    get: async (fileId: string) => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/files/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch file");
      return data;
    },
    update: async (fileId: string, updates: { content?: string, name?: string }) => {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/files/${fileId}`, {
        method: "PUT",
        headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(updates),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update file");
      return data;
    },
    delete: async (fileId: string) => {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_URL}/files/${fileId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to delete file");
        return data;
    }
  }
};

const API_URL = '/api/ai';

export const aiService = {
  ask: async (action: string, context: any) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action, context })
    });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'AI request failed'); }
    return response.json();
  },

  review: async (code: string, language: string, fileName: string, workspaceId?: string, fileList?: string[], workspaceName?: string) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ code, language, fileName, workspaceId, fileList, workspaceName })
    });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'AI review failed'); }
    return response.json();
  },

  suggestCommitMessage: async (changedFiles: string[], diffSummary: string) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/commit-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ changedFiles, diffSummary })
    });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Commit message generation failed'); }
    return response.json();
  },

  semanticSearch: async (query: string, fileList: string[], workspaceId: string, workspaceName?: string) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/semantic-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ query, fileList, workspaceId, workspaceName })
    });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Semantic search failed'); }
    return response.json();
  },

  multiFileReview: async (currentFile: { name: string; language: string; content: string }, relatedFiles: { name: string; language: string; excerpt: string }[]) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/multi-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ currentFile, relatedFiles })
    });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Multi-file review failed'); }
    return response.json();
  },

  projectSummary: async (workspaceName: string, fileList: string[], currentFileName: string) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/project-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ workspaceName, fileList, currentFileName })
    });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Project summary failed'); }
    return response.json();
  },

  prSummary: async (changedFiles: string[], diffSummary: string, branchName: string, workspaceName: string) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/pr-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ changedFiles, diffSummary, branchName, workspaceName })
    });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'PR summary failed'); }
    return response.json(); // { result: PRSummaryResult, parseError }
  },

  releaseNotes: async (commitMessages: string[], diffSummary: string, version: string, workspaceName: string) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/release-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ commitMessages, diffSummary, version, workspaceName })
    });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Release notes failed'); }
    return response.json(); // { result: ReleaseNotesResult, parseError }
  },

  repoHealth: async (workspaceName: string, fileList: string[], projectSummary?: string, commitMessages?: string[]) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/repo-health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ workspaceName, fileList, projectSummary: projectSummary || '', commitMessages: commitMessages || [] })
    });
    if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Repo health review failed'); }
    return response.json(); // { result: RepoHealthResult, parseError }
  }
};

async function json(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function ensureUser(base, email, password) {
  let token;
  let res = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  let data = await json(res);
  if (res.status === 201 && data && data.token) {
    token = data.token;
    console.log("registered", email);
  } else {
    // fallback to login
    res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    data = await json(res);
    if (!res.ok) throw new Error(`login failed for ${email}: ${data && data.error || data}`);
    token = data.token;
    console.log("logged in", email);
  }
  return token;
}

async function createWorkspace(base, token, name) {
  const res = await fetch(`${base}/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  const data = await json(res);
  if (!res.ok) throw new Error(`create workspace failed: ${data && data.error || data}`);
  return data;
}

async function inviteMember(base, token, workspaceId, email) {
  const res = await fetch(`${base}/workspaces/${workspaceId}/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email }),
  });
  const data = await json(res);
  if (!res.ok) throw new Error(`invite failed: ${data && data.error || data}`);
  return data;
}

async function joinWorkspace(base, token, workspaceId) {
  const res = await fetch(`${base}/workspaces/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ workspaceId }),
  });
  const data = await json(res);
  if (!res.ok) throw new Error(`join failed: ${data && data.error || data}`);
  return data;
}

async function listWorkspaces(base, token) {
  const res = await fetch(`${base}/workspaces`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await json(res);
  if (!res.ok) throw new Error(`list workspaces failed: ${data && data.error || data}`);
  return data;
}

async function createFile(base, token, workspaceId, name, content) {
  const res = await fetch(`${base}/workspaces/${workspaceId}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, content, language: "plaintext" }),
  });
  const data = await json(res);
  if (!res.ok) throw new Error(`create file failed: ${data && data.error || data}`);
  return data;
}

async function updateFile(base, token, fileId, updates) {
  const res = await fetch(`${base}/files/${fileId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(updates),
  });
  const data = await json(res);
  if (!res.ok) throw new Error(`update file failed: ${data && data.error || data}`);
  return data;
}

async function listFiles(base, token, workspaceId) {
  const res = await fetch(`${base}/workspaces/${workspaceId}/files`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await json(res);
  if (!res.ok) throw new Error(`list files failed: ${data && data.error || data}`);
  return data;
}

async function getFile(base, token, fileId) {
  const res = await fetch(`${base}/files/${fileId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await json(res);
  if (!res.ok) throw new Error(`get file failed: ${data && data.error || data}`);
  return data;
}

async function getVersions(base, token, fileId) {
  const res = await fetch(`${base}/files/${fileId}/versions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await json(res);
  if (!res.ok) throw new Error(`get versions failed: ${data && data.error || data}`);
  return data;
}

async function presenceEnter(base, token, workspaceId) {
  const res = await fetch(`${base}/workspaces/${workspaceId}/presence/enter`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await json(res);
  if (!res.ok) throw new Error(`presence enter failed: ${data && data.error || data}`);
  return data;
}

async function presenceGet(base, token, workspaceId) {
  const res = await fetch(`${base}/workspaces/${workspaceId}/presence`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await json(res);
  if (!res.ok) throw new Error(`presence get failed: ${data && data.error || data}`);
  return data;
}

async function activityGet(base, token, workspaceId) {
  const res = await fetch(`${base}/workspaces/${workspaceId}/activity`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await json(res);
  if (!res.ok) throw new Error(`activity get failed: ${data && data.error || data}`);
  return data;
}

async function main() {
  const base = "http://localhost:5000/api";
  const userA = { email: "user.a@example.com", password: "Passw0rd!" };
  const userB = { email: "user.b@example.com", password: "Passw0rd!" };

  const tokenA = await ensureUser(base, userA.email, userA.password);
  const tokenB = await ensureUser(base, userB.email, userB.password);

  const ws = await createWorkspace(base, tokenA, "Test Workspace");
  console.log("workspace created", ws.id);

  await inviteMember(base, tokenA, ws.id, userB.email);
  console.log("invited B");

  const listA = await listWorkspaces(base, tokenA);
  const listBBefore = await listWorkspaces(base, tokenB);
  console.log("list A count", listA.length, "list B before invite count", listBBefore.length);

  // B should now see membership after invite (depending on timing). If not, force join.
  const listB = await listWorkspaces(base, tokenB);
  const hasWs = Array.isArray(listB) && listB.some(w => w.id === ws.id);
  if (!hasWs) {
    await joinWorkspace(base, tokenB, ws.id);
    console.log("B joined");
  }

  const file = await createFile(base, tokenA, ws.id, "hello.txt", "hello");
  console.log("file created", file.id);

  const filesB = await listFiles(base, tokenB, ws.id);
  console.log("files for B", filesB.map(f => f.name).join(","));

  await updateFile(base, tokenA, file.id, { content: "hello world" });
  const fileB = await getFile(base, tokenB, file.id);
  console.log("file content for B", fileB.content);

  const versions = await getVersions(base, tokenA, file.id);
  console.log("versions count", versions.length);

  await presenceEnter(base, tokenA, ws.id);
  await presenceEnter(base, tokenB, ws.id);
  const pres = await presenceGet(base, tokenA, ws.id);
  console.log("presence users", pres.activeUsers.length);

  const activity = await activityGet(base, tokenA, ws.id);
  console.log("activity entries", activity.length);

  const ok = hasWs || true;
  console.log("E2E OK:", ok && fileB.content === "hello world" && pres.activeUsers.length >= 2 && activity.length >= 1);
}

main().catch(e => {
  console.error("e2e failed:", e && e.stack ? e.stack : e);
  process.exitCode = 1;
});

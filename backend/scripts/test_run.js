async function main() {
  const base = "http://localhost:5000/api";
  const user = { email: "run.user@example.com", password: "Passw0rd!" };
  let r = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
  let t = await r.text();
  let tok;
  try { tok = JSON.parse(t).token; } catch {}
  if (!tok) {
    r = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user),
    });
    t = await r.text();
    tok = JSON.parse(t).token;
  }
  const wsRes = await fetch(`${base}/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ name: "Run Workspace" }),
  });
  const ws = await wsRes.json();
  const fileRes = await fetch(`${base}/workspaces/${ws.id}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ name: "main.js", language: "JavaScript", content: "console.log('Hello from runner');" }),
  });
  const file = await fileRes.json();
  const runRes = await fetch(`${base}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ fileId: file.id }),
  });
  const runText = await runRes.text();
  console.log("run status", runRes.status);
  console.log("run body", runText);
}
main().catch(e => console.error(e && e.stack ? e.stack : e));

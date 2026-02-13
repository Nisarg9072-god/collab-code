// Lightweight test to register and list workspaces using Node fetch
async function main() {
  const base = "http://localhost:5000/api";
  const email = "demo.user3@example.com";
  const password = "Passw0rd!";
  try {
    const r = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const t = await r.text();
    console.log("register", r.status, t);
    let token;
    try {
      const data = JSON.parse(t);
      token = data.token;
    } catch {}
    if (!token) {
      console.log("no token from register; trying login");
      const rLogin = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const tLogin = await rLogin.text();
      console.log("login", rLogin.status, tLogin);
      const dataLogin = JSON.parse(tLogin);
      token = dataLogin.token;
    }
    if (!token) {
      console.error("No token available, aborting");
      return;
    }
    const r2 = await fetch(`${base}/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const t2 = await r2.text();
    console.log("workspaces", r2.status, t2);
  } catch (e) {
    console.error("test failed:", e && e.stack ? e.stack : e);
  }
}
main();

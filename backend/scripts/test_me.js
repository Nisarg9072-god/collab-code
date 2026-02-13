async function loginAndMe(email, password) {
  const base = "http://localhost:5000/api";
  const rLogin = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const tLogin = await rLogin.text();
  console.log("login", rLogin.status, tLogin);
  if (!rLogin.ok) return;
  const { token } = JSON.parse(tLogin);
  const rMe = await fetch(`${base}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const tMe = await rMe.text();
  console.log("me", rMe.status, tMe);
}

async function main() {
  const email = process.env.TEST_EMAIL || "demo.user3@example.com";
  const password = process.env.TEST_PASSWORD || "Passw0rd!";
  await loginAndMe(email, password);
}
main().catch(e => console.error(e && e.stack ? e.stack : e));

async function json(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function ensureToken(base, email, password) {
  let res = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  let data = await json(res);
  if (res.status === 201 && data && data.token) return data.token;
  res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  data = await json(res);
  if (!res.ok) throw new Error(`login failed: ${data && data.error || data}`);
  return data.token;
}

async function main() {
  const base = "http://localhost:5000/api";
  const email = "big.code@example.com";
  const password = "Passw0rd!";
  const token = await ensureToken(base, email, password);

  // Create workspace
  let res = await fetch(`${base}/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Big Program Workspace" }),
  });
  const ws = await json(res);
  if (!res.ok) throw new Error(`create workspace failed: ${ws && ws.error || ws}`);

  // Big Python program: reads N and N integers, computes stats and runs Dijkstra on a small graph
  const DATA = [
    "6",
    "5 1 5 2 10 2",
    "7",
    "0 1 4",
    "1 2 3",
    "2 3 8",
    "3 4 2",
    "4 5 7",
    "0 5 10",
    "1 4 6",
    "0"
  ].join("\n");
  const code = `
import sys, io
import heapq

DATA = ${JSON.stringify(DATA)}
sys.stdin = io.StringIO(DATA)

def read_input():
    n = int(input())
    arr = list(map(int, input().split()))
    m = int(input())
    edges = []
    for _ in range(m):
        u, v, w = map(int, input().split())
        edges.append((u, v, w))
    start = int(input())
    return n, arr, m, edges, start

def stats(arr):
    s = sum(arr)
    arr_sorted = sorted(arr)
    med = arr_sorted[len(arr_sorted)//2] if len(arr_sorted)%2==1 else (arr_sorted[len(arr_sorted)//2-1]+arr_sorted[len(arr_sorted)//2])/2
    freq = {}
    for a in arr:
        freq[a] = freq.get(a,0)+1
    top = sorted(freq.items(), key=lambda x:(-x[1], x[0]))[:5]
    return s, med, arr_sorted, top

def dijkstra(n, edges, start):
    g = [[] for _ in range(n)]
    for u,v,w in edges:
        g[u].append((v,w))
        g[v].append((u,w))
    dist = [10**18]*n
    dist[start]=0
    pq=[(0,start)]
    while pq:
        d,u = heapq.heappop(pq)
        if d != dist[u]: continue
        for v,w in g[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v]=nd
                heapq.heappush(pq,(nd,v))
    return dist

def main():
    n, arr, m, edges, start = read_input()
    s, med, arr_sorted, top = stats(arr)
    print("SUM:", s)
    print("MEDIAN:", med)
    print("SORTED:", " ".join(map(str, arr_sorted)))
    print("TOP_FREQ:", ",".join([f"{k}:{v}" for k,v in top]))
    dist = dijkstra(n, edges, start)
    print("DIJKSTRA:", " ".join(map(str, dist)))

if __name__ == "__main__":
    main()
`;

  // Create file in workspace
  res = await fetch(`${base}/workspaces/${ws.id}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "main.py", language: "Python", content: code }),
  });
  const file = await json(res);
  if (!res.ok) throw new Error(`create file failed: ${file && file.error || file}`);

  // Prepare stdin: n, n numbers, m edges, edges list, start
  // Example: 6 numbers; small graph of 6 nodes with weights
  const stdin = "";

  // Run file
  res = await fetch(`${base}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fileId: file.id, language: "Python", stdin }),
  });
  const run = await json(res);
  console.log("status", res.status);
  console.log("stdout:", run.stdout);
  console.log("stderr:", run.stderr);
  console.log("exitCode:", run.exitCode, "durationMs:", run.durationMs);
}

main().catch(e => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});

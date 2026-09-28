const BASE = "http://127.0.0.1:9090"

const set = (id, value) => {
  const node = document.getElementById(id)
  if (node) {
    node.textContent = value
  }
}

const probe = async () => {
  try {
    const health = await fetch(`${BASE}/health`)
    set("service", health.ok ? "running" : `http ${health.status}`)
    const root = await (await fetch(`${BASE}/`)).json()
    set("subscriptions", (root.subscriptions || []).join(", ") || "none")
    set("output", root.output ? JSON.stringify(root.output) : "file")
  } catch {
    set("service", "not reachable (HTTP output disabled?)")
  }
}

probe()

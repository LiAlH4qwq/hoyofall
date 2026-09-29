import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { yaml } from "@codemirror/lang-yaml"
import { json } from "@codemirror/lang-json"
import {
  SERVICES,
  readConfig,
  readLog,
  restart,
  run,
  start,
  status,
  stop,
  toast,
  writeConfig,
  type ServiceName,
  type ServiceStatus,
} from "./api"

const LABELS: Record<ServiceName, string> = {
  hoyofall: "hoyofall",
  "sing-box": "sing-box",
}

const useStatus = (service: ServiceName) => {
  const [state, setState] = useState<ServiceStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    void run(status(service)).then(
      (value) => {
        setState(value)
        setError(null)
      },
      (cause: Error) => setError(cause.message),
    )
  }, [service])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 3000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const act = useCallback(
    (action: "start" | "stop" | "restart") => {
      const effect = action === "start" ? start(service) : action === "stop" ? stop(service) : restart(service)
      void run(effect).then(
        () => refresh(),
        (cause: Error) => toast(`${LABELS[service]}: ${cause.message}`),
      )
    },
    [service, refresh],
  )

  return { state, error, refresh, act }
}

const StatusBadge = ({ status: value, error }: { status: ServiceStatus | null; error: string | null }) => {
  if (error) {
    return <span className="badge error">unavailable</span>
  }
  if (!value) {
    return <span className="badge">…</span>
  }
  if (!value.enabled) {
    return <span className="badge stopped">stopped</span>
  }
  return <span className={`badge ${value.running ? "running" : "starting"}`}>{value.running ? "running" : "starting"}</span>
}

const Controls = ({ service }: { service: ServiceName }) => {
  const { state, error, act } = useStatus(service)
  return (
    <div className="controls">
      <StatusBadge status={state} error={error} />
      <button type="button" onClick={() => act("start")}>
        Start
      </button>
      <button type="button" className="danger" onClick={() => act("stop")}>
        Stop
      </button>
      <button type="button" className="ghost" onClick={() => act("restart")}>
        Restart
      </button>
    </div>
  )
}

const Dashboard = ({ onOpen }: { onOpen: (service: ServiceName) => void }) => (
  <div className="cards">
    {SERVICES.map((service) => (
      <section key={service} className="card">
        <header>
          <h3>{LABELS[service]}</h3>
          <button type="button" className="ghost" onClick={() => onOpen(service)}>
            Open
          </button>
        </header>
        <Controls service={service} />
      </section>
    ))}
  </div>
)

const useConfig = (service: ServiceName) => {
  const [value, setValue] = useState("")
  const [dirty, setDirty] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(() => {
    void run(readConfig(service)).then(
      (text) => {
        setValue(text)
        setDirty(false)
        setLoaded(true)
      },
      (cause: Error) => toast(`load config failed: ${cause.message}`),
    )
  }, [service])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(() => {
    void run(writeConfig(service, value)).then(
      () => {
        setDirty(false)
        toast("config saved")
      },
      (cause: Error) => toast(`save failed: ${cause.message}`),
    )
  }, [service, value])

  return { value, setValue, dirty, loaded, load, save }
}

const ConfigEditor = ({ service }: { service: ServiceName }) => {
  const { value, setValue, dirty, load, save } = useConfig(service)
  const extensions = useMemo(() => (service === "sing-box" ? [json()] : [yaml()]), [service])
  return (
    <div className="editor">
      <CodeMirror
        value={value}
        height="58vh"
        extensions={extensions}
        onChange={(next) => {
          setValue(next)
        }}
      />
      <div className="controls">
        <span className={dirty ? "badge starting" : "badge"}>{dirty ? "unsaved" : "saved"}</span>
        <button type="button" onClick={save}>
          Save
        </button>
        <button type="button" className="ghost" onClick={load}>
          Reload
        </button>
      </div>
      <p className="hint">
        Applies after a restart ({LABELS[service] === "hoyofall" ? "use Restart" : "sing-box Restart"}).
      </p>
    </div>
  )
}

const LogViewer = ({ service }: { service: ServiceName }) => {
  const [log, setLog] = useState("")
  const [filter, setFilter] = useState("")
  const [follow, setFollow] = useState(true)
  const box = useRef<HTMLPreElement>(null)

  const refresh = useCallback(() => {
    void run(readLog(service)).then(
      (text) => setLog(text),
      (cause: Error) => setLog(`failed to read log: ${cause.message}`),
    )
  }, [service])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, follow ? 2000 : 8000)
    return () => window.clearInterval(timer)
  }, [refresh, follow])

  const shown = useMemo(() => {
    if (filter.trim() === "") {
      return log
    }
    const needle = filter.toLowerCase()
    return log
      .split("\n")
      .filter((line) => line.toLowerCase().includes(needle))
      .join("\n")
  }, [log, filter])

  useEffect(() => {
    if (follow && box.current) {
      box.current.scrollTop = box.current.scrollHeight
    }
  }, [shown, follow])

  return (
    <div className="logs">
      <input
        className="filter"
        placeholder="filter…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <label className="follow">
        <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />
        follow
      </label>
      <button type="button" className="ghost" onClick={refresh}>
        Refresh
      </button>
      <pre ref={box}>{shown || "(empty)"}</pre>
    </div>
  )
}

const ServicePanel = ({ service }: { service: ServiceName }) => {
  const [sub, setSub] = useState<"control" | "config" | "log">("control")
  return (
    <section className="panel">
      <nav className="subnav">
        <button type="button" className={sub === "control" ? "active" : ""} onClick={() => setSub("control")}>
          Control
        </button>
        <button type="button" className={sub === "config" ? "active" : ""} onClick={() => setSub("config")}>
          Config
        </button>
        <button type="button" className={sub === "log" ? "active" : ""} onClick={() => setSub("log")}>
          Log
        </button>
      </nav>
      {sub === "control" && (
        <div className="card">
          <Controls service={service} />
          <p className="hint">
            Config: <code>{service === "sing-box" ? "sing-box/config.json" : "hoyofall/config.yaml"}</code>
          </p>
        </div>
      )}
      {sub === "config" && <ConfigEditor service={service} />}
      {sub === "log" && <LogViewer service={service} />}
    </section>
  )
}

type Tab = "dashboard" | ServiceName

export const App = () => {
  const [tab, setTab] = useState<Tab>("dashboard")
  useEffect(() => {
    window.ksu?.fullScreen?.(true)
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <h1>hoyofall</h1>
      </header>
      <nav className="tabs">
        <button type="button" className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>
          Dashboard
        </button>
        {SERVICES.map((service) => (
          <button
            key={service}
            type="button"
            className={tab === service ? "active" : ""}
            onClick={() => setTab(service)}
          >
            {LABELS[service]}
          </button>
        ))}
      </nav>
      <main>
        {tab === "dashboard" && <Dashboard onOpen={setTab} />}
        {tab !== "dashboard" && <ServicePanel service={tab} />}
      </main>
    </div>
  )
}

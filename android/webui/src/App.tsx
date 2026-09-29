import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { yaml } from "@codemirror/lang-yaml"
import { json } from "@codemirror/lang-json"
import { Effect } from "effect"
import { parse } from "yaml"
import {
  SERVICES,
  readConfig,
  readConfigSource,
  readLog,
  renderConfigSource,
  restart,
  run,
  start,
  status,
  stop,
  toast,
  writeConfig,
  writeConfigSource,
  type ServiceName,
  type ServiceStatus,
} from "./api"
import { SchemaForm } from "./schemaForm"
import { formSchema, validateConfig } from "./configSchema"
import { applyValue } from "./yamlDoc"

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

type ConfigMode = "form" | "nushell" | "raw"

const MODE_KEY = (service: ServiceName) => `hoyofall.config.mode.${service}`

const readStoredMode = (service: ServiceName): ConfigMode | null => {
  const stored = window.localStorage.getItem(MODE_KEY(service))
  return stored === "form" || stored === "nushell" || stored === "raw"
    ? stored
    : null
}

const parseYaml = (text: string): unknown => {
  try {
    return parse(text)
  } catch {
    return undefined
  }
}

const nushellPlaceholder = (service: ServiceName): string =>
  service === "sing-box"
    ? '{ log: { level: "info", timestamp: true }, outbounds: [ { type: "direct", tag: "direct" } ], route: { final: "direct" } }'
    : '# The final expression is the hoyofall config record.\n{ subscriptions: { default: { name: "default", urlEnv: "HOYOFALL_SUB_URL" } } }'

const ConfigEditor = ({ service }: { service: ServiceName }) => {
  const [mode, setMode] = useState<ConfigMode>(
    () => readStoredMode(service) ?? (service === "hoyofall" ? "form" : "raw"),
  )
  const [raw, setRaw] = useState("")
  const [source, setSource] = useState("")
  const [value, setValue] = useState<unknown>({})
  const [preview, setPreview] = useState("")
  const [errors, setErrors] = useState<ReadonlyArray<string>>([])
  const [loaded, setLoaded] = useState(false)
  const [rawDirty, setRawDirty] = useState(false)
  const [sourceDirty, setSourceDirty] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  const initialised = useRef(false)

  const load = useCallback(() => {
    void run(
      Effect.gen(function* () {
        const text = yield* readConfig(service)
        const src = yield* readConfigSource(service)
        return { text, src }
      }),
    ).then(
      ({ text, src }) => {
        setRaw(text)
        setValue(parseYaml(text) ?? {})
        setRawDirty(false)
        setFormDirty(false)
        setErrors([])
        setSource(src)
        setSourceDirty(false)
        setLoaded(true)
      },
      (cause: Error) => toast(`load config failed: ${cause.message}`),
    )
  }, [service])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (loaded && !initialised.current) {
      initialised.current = true
      if (readStoredMode(service) === null && source !== "") {
        setMode("nushell")
      }
    }
  }, [loaded, source, service])

  const changeMode = useCallback(
    (next: ConfigMode) => {
      setMode(next)
      window.localStorage.setItem(MODE_KEY(service), next)
    },
    [service],
  )

  const saveRaw = useCallback(() => {
    void run(writeConfig(service, raw)).then(
      () => {
        toast("config saved")
        load()
      },
      (cause: Error) => toast(`save failed: ${cause.message}`),
    )
  }, [service, raw, load])

  const saveForm = useCallback(() => {
    const issues = validateConfig(value)
    setErrors(issues)
    if (issues.length > 0) {
      toast("fix the highlighted errors first")
      return
    }
    const text = applyValue(raw, value)
    void run(writeConfig(service, text)).then(
      () => {
        toast("config saved")
        load()
      },
      (cause: Error) => toast(`save failed: ${cause.message}`),
    )
  }, [service, raw, value, load])

  const saveSource = useCallback(() => {
    void run(writeConfigSource(service, source)).then(
      () => {
        toast("rendered and saved")
        setSourceDirty(false)
        load()
      },
      (cause: Error) => toast(`render failed: ${cause.message}`),
    )
  }, [service, source, load])

  const doPreview = useCallback(() => {
    void run(renderConfigSource(service)).then(
      (text) => setPreview(text),
      (cause: Error) => {
        setPreview("")
        toast(`preview failed: ${cause.message}`)
      },
    )
  }, [service])

  const modes: ReadonlyArray<ConfigMode> =
    service === "hoyofall" ? ["form", "nushell", "raw"] : ["nushell", "raw"]

  return (
    <div className="editor">
      <nav className="subnav">
        {modes.map((entry) => (
          <button
            key={entry}
            type="button"
            className={mode === entry ? "active" : ""}
            onClick={() => changeMode(entry)}
          >
            {entry === "form" ? "Form" : entry === "nushell" ? "Nushell" : "Raw"}
          </button>
        ))}
      </nav>
      {!loaded ? <p className="hint">loading…</p> : null}
      {loaded && mode === "form" ? (
        <div className="form-wrap">
          <SchemaForm
            schema={formSchema}
            value={value}
            onChange={(next) => {
              setValue(next)
              setFormDirty(true)
            }}
          />
          {errors.length > 0 ? (
            <ul className="errors">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
          <div className="controls">
            <span className={formDirty ? "badge starting" : "badge"}>
              {formDirty ? "unsaved" : "saved"}
            </span>
            <button type="button" onClick={saveForm}>
              Save
            </button>
            <button type="button" className="ghost" onClick={load}>
              Reload
            </button>
          </div>
        </div>
      ) : null}
      {loaded && mode === "nushell" ? (
        <div className="editor">
          <CodeMirror
            value={source}
            height="50vh"
            placeholder={nushellPlaceholder(service)}
            onChange={(next) => {
              setSource(next)
              setSourceDirty(true)
            }}
          />
          <div className="controls">
            <span className={sourceDirty ? "badge starting" : "badge"}>
              {sourceDirty ? "unsaved" : "saved"}
            </span>
            <button type="button" onClick={saveSource}>
              Render &amp; save
            </button>
            <button type="button" className="ghost" onClick={doPreview}>
              Preview
            </button>
            <button type="button" className="ghost" onClick={load}>
              Reload
            </button>
          </div>
          {preview !== "" ? <pre className="preview">{preview}</pre> : null}
          <p className="hint">
            A Nushell script whose final expression is the config record. It is
            rendered to {service === "sing-box" ? "JSON" : "YAML"}, validated,
            then written.
          </p>
        </div>
      ) : null}
      {loaded && mode === "raw" ? (
        <div className="editor">
          <CodeMirror
            value={raw}
            height="58vh"
            extensions={service === "sing-box" ? [json()] : [yaml()]}
            onChange={(next) => {
              setRaw(next)
              setRawDirty(true)
            }}
          />
          <div className="controls">
            <span className={rawDirty ? "badge starting" : "badge"}>
              {rawDirty ? "unsaved" : "saved"}
            </span>
            <button type="button" onClick={saveRaw}>
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
      ) : null}
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

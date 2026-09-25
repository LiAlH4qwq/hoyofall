import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { parse } from "yaml"
import { decodeConfig, validateConfig } from "../src/config/load"

const base = `
subscriptions:
  airport:
    url: https://example.com/sub
output:
  file:
    enabled: true
    mode: aggregate
    path: /tmp/fragment.json
`

describe("config decoding", () => {
  it("applies defaults", () => {
    const config = Effect.runSync(decodeConfig(parse(base), "test.yaml"))
    expect(config.convert.proxyNameFormat).toBe("{sub}-{name}")
    expect(config.convert.emitBuiltinOutbounds).toBe(false)
    expect(config.output.file.mode).toBe("aggregate")
    expect(config.output.file.pretty).toBe(true)
    expect(config.output.http.enabled).toBe(false)
    expect(config.subscriptions["airport"]?.intervalSeconds).toBe(3600)
    expect(config.subscriptions["airport"]?.onUnsupported).toBe("skip")
    expect(config.subscriptions["airport"]?.groups.native.enable).toBe(false)
    expect(config.subscriptions["airport"]?.groups.custom).toEqual({})
    expect(config.groups.custom).toEqual({})
  })

  it("defaults the output when omitted", () => {
    const yaml = `
subscriptions:
  airport:
    url: https://example.com/sub
`
    const config = Effect.runSync(decodeConfig(parse(yaml), "test.yaml"))
    expect(config.output.file.enabled).toBe(true)
    expect(config.output.file.mode).toBe("aggregate")
    expect(config.output.file.path).toBe("hoyofall.json")
    expect(config.output.file.directory).toBe(".")
    expect(config.output.http.enabled).toBe(false)
    const exit = Effect.runSyncExit(validateConfig(config))
    expect(exit._tag).toBe("Success")
  })

  it("defaults the aggregate path when only output.file is given", () => {
    const yaml = `
subscriptions:
  airport:
    url: https://example.com/sub
output:
  file:
    enabled: true
    mode: aggregate
`
    const config = Effect.runSync(decodeConfig(parse(yaml), "test.yaml"))
    expect(config.output.file.path).toBe("hoyofall.json")
    const exit = Effect.runSyncExit(validateConfig(config))
    expect(exit._tag).toBe("Success")
  })

  it("rejects a config with no outputs", () => {
    const yaml = `
subscriptions:
  airport:
    url: https://example.com/sub
output:
  file:
    enabled: false
  http:
    enabled: false
`
    const config = Effect.runSync(decodeConfig(parse(yaml), "test.yaml"))
    const exit = Effect.runSyncExit(validateConfig(config))
    expect(exit._tag).toBe("Failure")
  })

  it("rejects includeSubRegexes on subscription-level groups", () => {
    const yaml = `
subscriptions:
  a:
    url: https://example.com/sub
    groups:
      custom:
        x:
          includeSubRegexes: ["^a$"]
`
    const config = Effect.runSync(decodeConfig(parse(yaml), "test.yaml"))
    const exit = Effect.runSyncExit(validateConfig(config))
    expect(exit._tag).toBe("Failure")
  })

  it("rejects an empty subscriptions map", () => {
    const exit = Effect.runSyncExit(
      decodeConfig(parse("subscriptions: {}\noutput: {}\n"), "test.yaml"),
    )
    expect(exit._tag).toBe("Failure")
  })
})

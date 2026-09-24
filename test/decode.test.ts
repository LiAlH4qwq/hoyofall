import { Buffer } from "node:buffer"
import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { decodeSubscription } from "../src/mihomo/decode"

const clash = `
proxies:
  - name: ss1
    type: ss
    server: 1.2.3.4
    port: 8388
    cipher: aes-256-gcm
    password: pass
proxy-groups:
  - name: auto
    type: select
    proxies: ["ss1"]
`

describe("mihomo decoding", () => {
  it("decodes a clash YAML payload", () => {
    const decoded = Effect.runSync(decodeSubscription("s", clash, "clash"))
    expect(decoded.proxies).toHaveLength(1)
    expect(decoded.proxies[0]?._tag).toBe("proxy")
    expect(decoded.groups[0]?._tag).toBe("group")
  })

  it("decodes a base64 payload", () => {
    const encoded = Buffer.from(clash, "utf8").toString("base64")
    const decoded = Effect.runSync(decodeSubscription("s", encoded, "base64"))
    expect(decoded.proxies[0]?._tag).toBe("proxy")
  })

  it("auto-detects base64 payloads", () => {
    const encoded = Buffer.from(clash, "utf8").toString("base64")
    const decoded = Effect.runSync(decodeSubscription("s", encoded, "auto"))
    expect(decoded.proxies).toHaveLength(1)
  })

  it("reports unsupported proxy types", () => {
    const yaml = `
proxies:
  - name: snell1
    type: snell
    server: 1.1.1.1
    port: 1
    psk: x
`
    const decoded = Effect.runSync(decodeSubscription("s", yaml, "clash"))
    const first = decoded.proxies[0]
    expect(first?._tag).toBe("warning")
    if (first?._tag === "warning") {
      expect(first.warning._tag).toBe("UnsupportedProxyTypeError")
    }
  })
})

import { describe, expect, it } from "vitest"
import { formSchema, validateConfig } from "../android/webui/src/configSchema"
import { applyValue } from "../android/webui/src/yamlDoc"

describe("webui config form", () => {
  it("exposes the shared config schema", () => {
    expect(formSchema).toMatchObject({
      type: "object",
      required: ["subscriptions"],
    })
  })

  it("validates with the shared schema", () => {
    expect(
      validateConfig({ subscriptions: { a: { url: "https://example.com" } } }),
    ).toEqual([])
    expect(validateConfig({ subscriptions: {} }).length).toBeGreaterThan(0)
    expect(
      validateConfig({
        subscriptions: { a: { url: "https://example.com", urlEnv: "X" } },
      }).length,
    ).toBeGreaterThan(0)
  })

  it("applies form values while preserving comments", () => {
    const text = "# header\ngroups:\n  custom:\n    a:  # keep\n      level: 1\n"
    const next = applyValue(text, {
      groups: { custom: { a: { level: 2 }, b: { level: 3 } } },
    })
    expect(next).toContain("# header")
    expect(next).toContain("level: 2")
    expect(next).toContain("b:")
    expect(next).toContain("level: 3")
  })
})

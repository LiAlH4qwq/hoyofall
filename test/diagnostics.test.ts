import { describe, expect, it } from "vitest"
import { ConfigParseError, ConfigReadError, ConfigValidationError, UsageError } from "../src/errors"
import { formatDiagnostic, usage } from "../src/diagnostics"

describe("formatDiagnostic", () => {
  it("renders usage for a UsageError", () => {
    const text = formatDiagnostic(new UsageError({ message: "Missing --config." }))
    expect(text).toContain("Missing --config.")
    expect(text).toContain(usage)
  })

  it("renders the path and cause for a ConfigReadError", () => {
    const text = formatDiagnostic(
      new ConfigReadError({ path: "/etc/hoyofall.yaml", cause: new Error("ENOENT") }),
    )
    expect(text).toContain("/etc/hoyofall.yaml")
    expect(text).toContain("ENOENT")
  })

  it("lists issues for a parse error", () => {
    const text = formatDiagnostic(
      new ConfigParseError({ path: "config.yaml", issues: ["root.x: bad"] }),
    )
    expect(text).toContain("config.yaml")
    expect(text).toContain("root.x: bad")
  })

  it("lists issues for a validation error", () => {
    const text = formatDiagnostic(
      new ConfigValidationError({ issues: ["output: only one of a or b"] }),
    )
    expect(text).toContain("output: only one of a or b")
  })

  it("falls back for unknown errors", () => {
    expect(formatDiagnostic(new Error("boom"))).toContain("boom")
  })
})

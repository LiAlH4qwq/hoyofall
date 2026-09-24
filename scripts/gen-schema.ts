import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { JSONSchema } from "effect"
import { Config } from "../src/config/schema"

const target = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "schema.json")
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, `${JSON.stringify(JSONSchema.make(Config), null, 2)}\n`)
process.stdout.write(`${target}\n`)

import { createHash } from "node:crypto"

export const hashText = (text: string): string =>
  createHash("sha256").update(text).digest("hex")

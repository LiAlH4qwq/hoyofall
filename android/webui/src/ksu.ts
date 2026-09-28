import { Effect } from "effect"

export type ExecResult = { errno: number; stdout: string; stderr: string }

declare global {
  interface Window {
    // The KernelSU bridge installs a named callback on `window`; the index
    // signature lets us set it without a cast.
    [key: string]: unknown
    ksu?: {
      exec: (command: string, options: string, callback: string) => void
      toast?: (message: string) => void
      fullScreen?: (value: boolean) => void
      moduleInfo?: () => string
    }
  }
}

const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause))

export const exec = (
  command: string,
  env: Record<string, string>,
): Effect.Effect<ExecResult, Error> =>
  Effect.tryPromise({
    try: () =>
      new Promise<ExecResult>((resolve, reject) => {
        const ksu = window.ksu
        if (!ksu) {
          reject(new Error("KernelSU WebUI API not available"))
          return
        }
        // KernelSU invokes the callback by global name; a UUID keeps names
        // unique without mutable shared state.
        const name = `hoyofall_callback_${globalThis.crypto.randomUUID().replaceAll("-", "")}`
        window[name] = (errno: number, stdout: string, stderr: string) => {
          resolve({ errno, stdout, stderr })
        }
        try {
          ksu.exec(command, JSON.stringify({ env }), name)
        } catch (error) {
          reject(toError(error))
        }
      }),
    catch: toError,
  })

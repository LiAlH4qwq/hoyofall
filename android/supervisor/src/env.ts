import { modulePath } from "./paths"
import type { EnvRecord } from "./dotenv"

// Build the environment for a supervised child. Native dependencies are staged
// next to the binaries (`lib/`), and the prebuilt payloads bundle a CA store;
// we pass both explicitly instead of mutating the supervisor's own `process.env`.
export const childEnvironment = (
  tokenEnv: EnvRecord,
): NodeJS.ProcessEnv => {
  const libDir = modulePath("lib")
  const cert = modulePath("etc", "ssl", "cert.pem")
  const inherited = process.env.LD_LIBRARY_PATH ?? ""
  return {
    ...process.env,
    ...tokenEnv,
    LD_LIBRARY_PATH: inherited === "" ? libDir : `${libDir}:${inherited}`,
    SSL_CERT_FILE: cert,
    NODE_EXTRA_CA_CERTS: cert,
    SSL_CERT_DIR: "/system/etc/security/cacerts",
  }
}

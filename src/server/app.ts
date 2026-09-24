import { HttpServer } from "@effect/platform"
import type { HttpRouter } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { Layer } from "effect"
import { createServer } from "node:http"

export const serverLayer = (
  router: HttpRouter.HttpRouter<never, never>,
  listen: { readonly host: string; readonly port: number },
) =>
  HttpServer.serve(router).pipe(
    Layer.provide(
      NodeHttpServer.layer(() => createServer(), {
        host: listen.host,
        port: listen.port,
      }),
    ),
  )

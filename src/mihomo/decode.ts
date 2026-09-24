import { Effect, Either, ParseResult, Schema } from "effect"
import { parse as parseYaml } from "yaml"
import {
  GroupDecodeError,
  PayloadDecodeError,
  ProxyDecodeError,
  UnsupportedGroupTypeError,
  UnsupportedProxyTypeError,
} from "../errors"
import {
  Anytls,
  FallbackGroup,
  Hysteria,
  Hysteria2,
  Http,
  LoadBalanceGroup,
  ProxyHeader,
  RawSubscription,
  SelectGroup,
  Socks5,
  Ss,
  Trojan,
  Tuic,
  UrlTestGroup,
  Vless,
  Vmess,
  Wireguard,
  type MihomoGroup,
  type MihomoProxy,
} from "./schema"

export type ProxyResult =
  | { readonly _tag: "proxy"; readonly proxy: MihomoProxy }
  | {
      readonly _tag: "warning"
      readonly warning: UnsupportedProxyTypeError | ProxyDecodeError
    }

export type GroupResult =
  | { readonly _tag: "group"; readonly group: MihomoGroup }
  | {
      readonly _tag: "warning"
      readonly warning: UnsupportedGroupTypeError | GroupDecodeError
    }

export interface DecodedSubscription {
  readonly proxies: ReadonlyArray<ProxyResult>
  readonly groups: ReadonlyArray<GroupResult>
}

const formatIssues = (error: ParseResult.ParseError): ReadonlyArray<string> =>
  ParseResult.ArrayFormatter.formatErrorSync(error).map(
    (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`,
  )

const decodeBase64 = (value: string): string =>
  Buffer.from(value, "base64").toString("utf8")

const parseYamlDocument = (
  subscriptionId: string,
  value: string,
): Effect.Effect<unknown, PayloadDecodeError> =>
  Effect.try({
    try: () => parseYaml(value) as unknown,
    catch: (cause) =>
      new PayloadDecodeError({
        subscription: subscriptionId,
        issues: [String(cause)],
      }),
  })

const toDocument = (
  subscriptionId: string,
  text: string,
  format: "auto" | "clash" | "base64",
): Effect.Effect<unknown, PayloadDecodeError> => {
  if (format === "base64") {
    return parseYamlDocument(subscriptionId, decodeBase64(text))
  }
  if (format === "clash") {
    return parseYamlDocument(subscriptionId, text)
  }
  return parseYamlDocument(subscriptionId, text).pipe(
    Effect.flatMap((parsed) =>
      typeof parsed === "string"
        ? parseYamlDocument(subscriptionId, decodeBase64(parsed))
        : Effect.succeed(parsed),
    ),
  )
}

const proxyDecoded = <A extends MihomoProxy>(
  result: Either.Either<A, ParseResult.ParseError>,
  subscriptionId: string,
  name: string,
): ProxyResult =>
  Either.match(result, {
    onLeft: (error): ProxyResult => ({
      _tag: "warning",
      warning: new ProxyDecodeError({
        subscription: subscriptionId,
        proxy: name,
        issues: formatIssues(error),
      }),
    }),
    onRight: (proxy): ProxyResult => ({ _tag: "proxy", proxy }),
  })

const decodeProxyAs = <A extends MihomoProxy>(
  schema: Schema.Schema<A>,
  subscriptionId: string,
  name: string,
  raw: unknown,
): ProxyResult =>
  proxyDecoded(
    Schema.decodeUnknownEither(schema, { errors: "all" })(raw),
    subscriptionId,
    name,
  )

export const decodeProxy = (subscriptionId: string, raw: unknown): ProxyResult => {
  const header = Schema.decodeUnknownEither(ProxyHeader)(raw)
  if (Either.isLeft(header)) {
    return {
      _tag: "warning",
      warning: new ProxyDecodeError({
        subscription: subscriptionId,
        proxy: "<unknown>",
        issues: formatIssues(header.left),
      }),
    }
  }
  const { name, type } = header.right
  switch (type) {
    case "ss":
      return decodeProxyAs(Ss, subscriptionId, name, raw)
    case "vmess":
      return decodeProxyAs(Vmess, subscriptionId, name, raw)
    case "vless":
      return decodeProxyAs(Vless, subscriptionId, name, raw)
    case "trojan":
      return decodeProxyAs(Trojan, subscriptionId, name, raw)
    case "hysteria":
      return decodeProxyAs(Hysteria, subscriptionId, name, raw)
    case "hysteria2":
      return decodeProxyAs(Hysteria2, subscriptionId, name, raw)
    case "tuic":
      return decodeProxyAs(Tuic, subscriptionId, name, raw)
    case "wireguard":
      return decodeProxyAs(Wireguard, subscriptionId, name, raw)
    case "http":
      return decodeProxyAs(Http, subscriptionId, name, raw)
    case "socks5":
      return decodeProxyAs(Socks5, subscriptionId, name, raw)
    case "anytls":
      return decodeProxyAs(Anytls, subscriptionId, name, raw)
    default:
      return {
        _tag: "warning",
        warning: new UnsupportedProxyTypeError({
          subscription: subscriptionId,
          proxy: name,
          type,
        }),
      }
  }
}

const groupDecoded = <A extends MihomoGroup>(
  result: Either.Either<A, ParseResult.ParseError>,
  subscriptionId: string,
  name: string,
): GroupResult =>
  Either.match(result, {
    onLeft: (error): GroupResult => ({
      _tag: "warning",
      warning: new GroupDecodeError({
        subscription: subscriptionId,
        group: name,
        issues: formatIssues(error),
      }),
    }),
    onRight: (group): GroupResult => ({ _tag: "group", group }),
  })

const decodeGroupAs = <A extends MihomoGroup>(
  schema: Schema.Schema<A>,
  subscriptionId: string,
  name: string,
  raw: unknown,
): GroupResult =>
  groupDecoded(
    Schema.decodeUnknownEither(schema, { errors: "all" })(raw),
    subscriptionId,
    name,
  )

export const decodeGroup = (subscriptionId: string, raw: unknown): GroupResult => {
  const header = Schema.decodeUnknownEither(ProxyHeader)(raw)
  if (Either.isLeft(header)) {
    return {
      _tag: "warning",
      warning: new GroupDecodeError({
        subscription: subscriptionId,
        group: "<unknown>",
        issues: formatIssues(header.left),
      }),
    }
  }
  const { name, type } = header.right
  switch (type) {
    case "select":
      return decodeGroupAs(SelectGroup, subscriptionId, name, raw)
    case "url-test":
      return decodeGroupAs(UrlTestGroup, subscriptionId, name, raw)
    case "fallback":
      return decodeGroupAs(FallbackGroup, subscriptionId, name, raw)
    case "load-balance":
      return decodeGroupAs(LoadBalanceGroup, subscriptionId, name, raw)
    default:
      return {
        _tag: "warning",
        warning: new UnsupportedGroupTypeError({
          subscription: subscriptionId,
          group: name,
          type,
        }),
      }
  }
}

export const decodeSubscription = (
  subscriptionId: string,
  text: string,
  format: "auto" | "clash" | "base64",
): Effect.Effect<DecodedSubscription, PayloadDecodeError> =>
  Effect.gen(function* () {
    const document = yield* toDocument(subscriptionId, text, format)
    const raw = yield* Schema.decodeUnknown(RawSubscription, {
      errors: "all",
    })(document).pipe(
      Effect.mapError(
        (error) =>
          new PayloadDecodeError({
            subscription: subscriptionId,
            issues: formatIssues(error),
          }),
      ),
    )
    return {
      proxies: raw.proxies.map((proxy) => decodeProxy(subscriptionId, proxy)),
      groups: raw["proxy-groups"].map((group) =>
        decodeGroup(subscriptionId, group),
      ),
    } satisfies DecodedSubscription
  })

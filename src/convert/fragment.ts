import { Effect } from "effect"
import type { ResolvedSubscription } from "../config/load"
import type { ConvertOptions } from "../config/schema"
import {
  MissingReferenceError,
  StrictConversionError,
  type ConversionWarning,
} from "../errors"
import type { DecodedSubscription } from "../mihomo/decode"
import type { Fragment, Outbound } from "../singbox/schema"
import { convertGroup } from "./group"
import { convertProxy } from "./proxy"

export interface SubscriptionFragment {
  readonly subscriptionId: string
  readonly fragment: Fragment
  readonly warnings: ReadonlyArray<ConversionWarning>
}

const BuiltinTags: Record<string, string> = {
  DIRECT: "direct",
  REJECT: "block",
  PASS: "direct",
}

export const formatTag = (
  template: string,
  subscriptionName: string,
  name: string,
): string =>
  template.replaceAll("{sub}", subscriptionName).replaceAll("{name}", name)

export const warningMessage = (warning: ConversionWarning): string => {
  switch (warning._tag) {
    case "UnsupportedProxyTypeError":
      return `subscription ${warning.subscription}: proxy ${warning.proxy} has unsupported type ${warning.type}`
    case "UnsupportedGroupTypeError":
      return `subscription ${warning.subscription}: group ${warning.group} has unsupported type ${warning.type}`
    case "ProxyDecodeError":
      return `subscription ${warning.subscription}: proxy ${warning.proxy} failed to decode: ${warning.issues.join("; ")}`
    case "GroupDecodeError":
      return `subscription ${warning.subscription}: group ${warning.group} failed to decode: ${warning.issues.join("; ")}`
    case "MissingReferenceError":
      return `subscription ${warning.subscription}: group ${warning.group} references unknown outbound ${warning.reference}`
  }
}

export const convertSubscription = (
  subscription: ResolvedSubscription,
  decoded: DecodedSubscription,
  options: ConvertOptions,
): Effect.Effect<SubscriptionFragment, StrictConversionError> => {
  const decodeWarnings: ReadonlyArray<ConversionWarning> = [
    ...decoded.proxies.flatMap((result) =>
      result._tag === "warning" ? [result.warning] : [],
    ),
    ...(subscription.convert.includeGroups
      ? decoded.groups.flatMap((result) =>
          result._tag === "warning" ? [result.warning] : [],
        )
      : []),
  ]

  const proxied = decoded.proxies.flatMap((result) =>
    result._tag === "proxy" ? [result.proxy] : [],
  )
  const grouped = subscription.convert.includeGroups
    ? decoded.groups.flatMap((result) =>
        result._tag === "group" ? [result.group] : [],
      )
    : []

  const isExcluded = (name: string): boolean =>
    subscription.convert.exclude.some((pattern) => new RegExp(pattern).test(name))

  const keptProxies = proxied.filter((proxy) => !isExcluded(proxy.name))
  const keptGroups = grouped.filter((group) => !isExcluded(group.name))

  const format = options.proxyNameFormat

  const proxyTags = keptProxies.map((proxy) => ({
    original: proxy.name,
    tag: formatTag(format, subscription.name, proxy.name),
  }))
  const groupTags = keptGroups.map((group) => ({
    original: group.name,
    tag: formatTag(format, subscription.name, group.name),
  }))

  const nameMap = new Map<string, string>(
    [...proxyTags, ...groupTags].map((entry) => [entry.original, entry.tag]),
  )

  const resolve = (reference: string): string | undefined =>
    nameMap.get(reference) ??
    (Object.hasOwn(BuiltinTags, reference) ? BuiltinTags[reference] : undefined)

  const groupConversions = keptGroups.map((group) => ({
    group,
    tag: formatTag(format, subscription.name, group.name),
    conversion: convertGroup({
      group,
      tag: formatTag(format, subscription.name, group.name),
      resolve,
      fallback: subscription.convert.fallback,
      loadBalance: subscription.convert.loadBalance,
    }),
  }))

  const missingWarnings: ReadonlyArray<ConversionWarning> =
    groupConversions.flatMap(({ group, conversion }) =>
      conversion.missing.map(
        (reference) =>
          new MissingReferenceError({
            subscription: subscription.id,
            group: group.name,
            reference,
          }),
      ),
    )

  const warnings: ReadonlyArray<ConversionWarning> = [
    ...decodeWarnings,
    ...missingWarnings,
  ]

  const proxyOutbounds: ReadonlyArray<Outbound> = keptProxies.map((proxy) =>
    convertProxy(
      proxy,
      formatTag(options.proxyNameFormat, subscription.name, proxy.name),
    ),
  )
  const groupOutbounds: ReadonlyArray<Outbound> = groupConversions.flatMap(
    ({ conversion }) => (conversion.outbound === undefined ? [] : [conversion.outbound]),
  )

  const fragment: Fragment = {
    outbounds: [...proxyOutbounds, ...groupOutbounds],
  }

  return subscription.onUnsupported === "fail" && warnings.length > 0
    ? Effect.fail(
        new StrictConversionError({
          subscription: subscription.id,
          issues: warnings.map(warningMessage),
        }),
      )
    : Effect.succeed({
        subscriptionId: subscription.id,
        fragment,
        warnings,
      })
}

export const mergeFragments = (
  fragments: ReadonlyArray<Fragment>,
): Fragment => ({
  outbounds: fragments.flatMap((fragment) => fragment.outbounds),
})

export const withBuiltinOutbounds = (
  fragment: Fragment,
  emit: boolean,
): Fragment =>
  emit
    ? {
        outbounds: [
          { type: "direct", tag: "direct" },
          { type: "block", tag: "block" },
          ...fragment.outbounds,
        ],
      }
    : fragment

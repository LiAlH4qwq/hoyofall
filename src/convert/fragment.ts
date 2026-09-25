import { Effect } from "effect"
import type { ResolvedConfig, ResolvedSubscription } from "../config/load"
import type { ConvertOptions, CustomGroup } from "../config/schema"
import {
  DuplicateTagError,
  EmptyCustomGroupError,
  MissingReferenceError,
  StrictConversionError,
  type ConversionWarning,
} from "../errors"
import type { DecodedSubscription } from "../mihomo/decode"
import type { Fragment, Outbound } from "../singbox/schema"
import { convertCustomGroup, convertGroup } from "./group"
import { convertProxy } from "./proxy"

export interface TagEntry {
  readonly original: string
  readonly tag: string
}

export interface SubscriptionFragment {
  readonly subscriptionId: string
  readonly subscriptionName: string
  readonly fragment: Fragment
  readonly warnings: ReadonlyArray<ConversionWarning>
  readonly proxies: ReadonlyArray<TagEntry>
  readonly nativeGroups: ReadonlyArray<TagEntry>
  readonly customGroups: ReadonlyArray<TagEntry>
}

export interface AssembledFragment {
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

interface Candidate {
  readonly key: string
  readonly tag: string
}

const matchesAny = (
  patterns: ReadonlyArray<string>,
  value: string,
): boolean => patterns.some((pattern) => new RegExp(pattern).test(value))

const dedupe = (tags: ReadonlyArray<string>): ReadonlyArray<string> =>
  tags.filter((tag, index) => tags.indexOf(tag) === index)

const selectByRegex = (
  candidates: ReadonlyArray<Candidate>,
  includeRegex: ReadonlyArray<string>,
  excludeRegex: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  candidates
    .filter(
      (candidate) =>
        (includeRegex.length === 0 ||
          matchesAny(includeRegex, candidate.key)) &&
        !matchesAny(excludeRegex, candidate.key),
    )
    .map((candidate) => candidate.tag)

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
      return `${warning.scope}: group ${warning.group} references unknown outbound ${warning.reference}`
    case "EmptyCustomGroupError":
      return `${warning.scope}: custom group ${warning.group} matched no outbounds`
  }
}

interface BuildCustomGroupArgs {
  readonly scope: string
  readonly id: string
  readonly tag: string
  readonly group: CustomGroup
  readonly proxyCandidates: ReadonlyArray<Candidate>
  readonly nativeCandidates: ReadonlyArray<Candidate>
  readonly customCandidates: ReadonlyArray<Candidate>
  readonly resolveReference: (name: string) => string | undefined
}

interface BuiltCustomGroup {
  readonly outbound: Outbound | undefined
  readonly entry: TagEntry | undefined
  readonly warnings: ReadonlyArray<ConversionWarning>
  readonly error: EmptyCustomGroupError | undefined
}

const buildCustomGroup = (args: BuildCustomGroupArgs): BuiltCustomGroup => {
  const { group } = args
  const customCandidates = args.customCandidates.filter(
    (candidate) => candidate.key !== args.id,
  )
  const selected = dedupe([
    ...(group.includeProxies
      ? selectByRegex(args.proxyCandidates, group.includeRegex, group.excludeRegex)
      : []),
    ...(group.includeNativeGroups
      ? selectByRegex(args.nativeCandidates, group.includeRegex, group.excludeRegex)
      : []),
    ...(group.includeCustomGroups
      ? selectByRegex(customCandidates, group.includeRegex, group.excludeRegex)
      : []),
    ...group.members.flatMap((name) => {
      const tag = args.resolveReference(name)
      return tag === undefined ? [] : [tag]
    }),
    ...(group.includeDirect ? ["direct"] : []),
    ...(group.includeBlock ? ["block"] : []),
  ])

  const referenceWarnings: ReadonlyArray<ConversionWarning> = [
    ...group.members.flatMap((name) =>
      args.resolveReference(name) === undefined
        ? [
            new MissingReferenceError({
              scope: args.scope,
              group: args.id,
              reference: name,
            }),
          ]
        : [],
    ),
  ]

  const defaultTag =
    group.default === null ? undefined : args.resolveReference(group.default)
  const defaultWarnings: ReadonlyArray<ConversionWarning> =
    group.default !== null && defaultTag === undefined
      ? [
          new MissingReferenceError({
            scope: args.scope,
            group: args.id,
            reference: group.default,
          }),
        ]
      : []

  const conversion = convertCustomGroup({
    group,
    tag: args.tag,
    memberTags: selected,
    defaultTag,
  })

  if (!conversion.empty) {
    return {
      outbound: conversion.outbound,
      entry: { original: args.id, tag: args.tag },
      warnings: [...referenceWarnings, ...defaultWarnings],
      error: undefined,
    }
  }

  const emptyError = new EmptyCustomGroupError({
    scope: args.scope,
    group: args.id,
  })
  return {
    outbound: undefined,
    entry: undefined,
    warnings: [...referenceWarnings, ...defaultWarnings, emptyError],
    error: group.onEmpty === "fail" ? emptyError : undefined,
  }
}

export const convertSubscription = (
  subscription: ResolvedSubscription,
  decoded: DecodedSubscription,
  options: ConvertOptions,
): Effect.Effect<SubscriptionFragment, StrictConversionError> => {
  const native = subscription.groups.native

  const decodeWarnings: ReadonlyArray<ConversionWarning> = [
    ...decoded.proxies.flatMap((result) =>
      result._tag === "warning" ? [result.warning] : [],
    ),
    ...(native.enable
      ? decoded.groups.flatMap((result) =>
          result._tag === "warning" ? [result.warning] : [],
        )
      : []),
  ]

  const proxied = decoded.proxies.flatMap((result) =>
    result._tag === "proxy" ? [result.proxy] : [],
  )
  const grouped = decoded.groups.flatMap((result) =>
    result._tag === "group" ? [result.group] : [],
  )

  const isExcluded = (name: string): boolean =>
    matchesAny(subscription.convert.exclude, name)

  const keptProxies = proxied.filter((proxy) => !isExcluded(proxy.name))
  const keptGroups = native.enable
    ? grouped.filter(
        (group) =>
          !isExcluded(group.name) &&
          (native.includeRegex.length === 0 ||
            matchesAny(native.includeRegex, group.name)) &&
          !matchesAny(native.excludeRegex, group.name),
      )
    : []

  const format = options.proxyNameFormat

  const proxies: ReadonlyArray<TagEntry> = keptProxies.map((proxy) => ({
    original: proxy.name,
    tag: formatTag(format, subscription.name, proxy.name),
  }))
  const nativeEntries: ReadonlyArray<TagEntry> = keptGroups.map((group) => ({
    original: group.name,
    tag: formatTag(format, subscription.name, group.name),
  }))

  const nameMap = new Map<string, string>(
    [...proxies, ...nativeEntries].map((entry) => [entry.original, entry.tag]),
  )

  const resolve = (reference: string): string | undefined =>
    nameMap.get(reference) ??
    (Object.hasOwn(BuiltinTags, reference) ? BuiltinTags[reference] : undefined)

  const nativeConversions = keptGroups.map((group) => ({
    group,
    conversion: convertGroup({
      group,
      tag: formatTag(format, subscription.name, group.name),
      resolve,
      fallback: native.fallback,
      loadBalance: native.loadBalance,
    }),
  }))

  const missingWarnings: ReadonlyArray<ConversionWarning> =
    nativeConversions.flatMap(({ group, conversion }) =>
      conversion.missing.map(
        (reference) =>
          new MissingReferenceError({
            scope: `subscriptions.${subscription.id}`,
            group: group.name,
            reference,
          }),
      ),
    )

  const customIds = Object.keys(subscription.groups.custom)
  const customEntries: ReadonlyArray<TagEntry> = customIds.map((id) => ({
    original: id,
    tag: formatTag(format, subscription.name, id),
  }))

  const fullNameMap = new Map<string, string>(
    [...proxies, ...nativeEntries, ...customEntries].map((entry) => [
      entry.original,
      entry.tag,
    ]),
  )
  const resolveFull = (reference: string): string | undefined =>
    fullNameMap.get(reference) ??
    (Object.hasOwn(BuiltinTags, reference) ? BuiltinTags[reference] : undefined)

  const proxyCandidates: ReadonlyArray<Candidate> = proxies.map((entry) => ({
    key: entry.original,
    tag: entry.tag,
  }))
  const nativeCandidates: ReadonlyArray<Candidate> = nativeEntries.map(
    (entry) => ({ key: entry.original, tag: entry.tag }),
  )
  const customCandidates: ReadonlyArray<Candidate> = customEntries.map(
    (entry) => ({ key: entry.original, tag: entry.tag }),
  )

  const builtCustomGroups = Object.entries(subscription.groups.custom).map(
    ([id, group]) =>
      buildCustomGroup({
        scope: `subscriptions.${subscription.id}`,
        id,
        tag: formatTag(format, subscription.name, id),
        group,
        proxyCandidates,
        nativeCandidates,
        customCandidates,
        resolveReference: resolveFull,
      }),
  )

  const nativeWithOutbounds = nativeConversions.filter(
    ({ conversion }) => conversion.outbound !== undefined,
  )
  const nativeKept: ReadonlyArray<TagEntry> = nativeWithOutbounds.map(
    ({ group }) => ({
      original: group.name,
      tag: formatTag(format, subscription.name, group.name),
    }),
  )
  const customKept: ReadonlyArray<TagEntry> = builtCustomGroups.flatMap(
    (built) => (built.entry === undefined ? [] : [built.entry]),
  )

  const proxyOutbounds: ReadonlyArray<Outbound> = keptProxies.map((proxy) =>
    convertProxy(proxy, formatTag(format, subscription.name, proxy.name)),
  )
  const nativeOutbounds: ReadonlyArray<Outbound> = nativeWithOutbounds.flatMap(
    ({ conversion }) =>
      conversion.outbound === undefined ? [] : [conversion.outbound],
  )
  const customOutbounds: ReadonlyArray<Outbound> = builtCustomGroups.flatMap(
    (built) => (built.outbound === undefined ? [] : [built.outbound]),
  )

  const warnings: ReadonlyArray<ConversionWarning> = [
    ...decodeWarnings,
    ...missingWarnings,
    ...builtCustomGroups.flatMap((built) => built.warnings),
  ]

  const hardFail = builtCustomGroups.some((built) => built.error !== undefined)

  if (hardFail || (subscription.onUnsupported === "fail" && warnings.length > 0)) {
    return Effect.fail(
      new StrictConversionError({
        subscription: subscription.id,
        issues: warnings.map(warningMessage),
      }),
    )
  }

  return Effect.succeed({
    subscriptionId: subscription.id,
    subscriptionName: subscription.name,
    fragment: {
      outbounds: [...proxyOutbounds, ...nativeOutbounds, ...customOutbounds],
    },
    warnings,
    proxies,
    nativeGroups: nativeKept,
    customGroups: customKept,
  })
}

export const assembleFragment = (
  config: ResolvedConfig,
  fragments: ReadonlyArray<SubscriptionFragment>,
): Effect.Effect<AssembledFragment, DuplicateTagError | EmptyCustomGroupError> => {
  const instanceIds = Object.keys(config.groups.custom)

  const proxyCandidates: ReadonlyArray<Candidate> = fragments.flatMap(
    (fragment) =>
      fragment.proxies.map((entry) => ({
        key: `${fragment.subscriptionName}/${entry.original}`,
        tag: entry.tag,
      })),
  )
  const nativeCandidates: ReadonlyArray<Candidate> = fragments.flatMap(
    (fragment) =>
      fragment.nativeGroups.map((entry) => ({
        key: `${fragment.subscriptionName}/${entry.original}`,
        tag: entry.tag,
      })),
  )
  const subscriptionCustomCandidates: ReadonlyArray<Candidate> = fragments.flatMap(
    (fragment) =>
      fragment.customGroups.map((entry) => ({
        key: `${fragment.subscriptionName}/${entry.original}`,
        tag: entry.tag,
      })),
  )
  const instanceCandidates: ReadonlyArray<Candidate> = instanceIds.map((id) => ({
    key: id,
    tag: id,
  }))

  const nameMap = new Map<string, string>(
    [
      ...proxyCandidates,
      ...nativeCandidates,
      ...subscriptionCustomCandidates,
      ...instanceCandidates,
    ].map((candidate) => [candidate.key, candidate.tag]),
  )
  const resolve = (reference: string): string | undefined =>
    nameMap.get(reference) ??
    (Object.hasOwn(BuiltinTags, reference) ? BuiltinTags[reference] : undefined)

  const built = Object.entries(config.groups.custom).map(([id, group]) => ({
    id,
    built: buildCustomGroup({
      scope: "groups",
      id,
      tag: id,
      group,
      proxyCandidates,
      nativeCandidates,
      customCandidates: [...subscriptionCustomCandidates, ...instanceCandidates],
      resolveReference: resolve,
    }),
  }))

  const emptyError = built
    .map(({ built: result }) => result.error)
    .find((error) => error !== undefined)

  const warnings: ReadonlyArray<ConversionWarning> = built.flatMap(
    ({ built: result }) => result.warnings,
  )

  const instanceOutbounds: ReadonlyArray<Outbound> = built.flatMap(
    ({ built: result }) => (result.outbound === undefined ? [] : [result.outbound]),
  )

  const baseOutbounds: ReadonlyArray<Outbound> = [
    ...fragments.flatMap((fragment) => fragment.fragment.outbounds),
    ...instanceOutbounds,
  ]
  const outbounds: ReadonlyArray<Outbound> = config.convert.emitBuiltinOutbounds
    ? [
        { type: "direct", tag: "direct" },
        { type: "block", tag: "block" },
        ...baseOutbounds,
      ]
    : baseOutbounds

  const tags = outbounds.map((outbound) => outbound.tag)
  const duplicates = dedupe(tags.filter((tag, index) => tags.indexOf(tag) !== index))

  if (emptyError !== undefined) {
    return Effect.fail(emptyError)
  }
  if (duplicates.length > 0) {
    return Effect.fail(new DuplicateTagError({ tags: duplicates }))
  }

  return Effect.succeed({ fragment: { outbounds }, warnings })
}

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

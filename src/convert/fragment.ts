import { Effect } from "effect"
import type { ResolvedConfig, ResolvedSubscription } from "../config/load"
import type { ConvertOptions, CustomGroup, MemberRef } from "../config/schema"
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
  readonly subscription: string
  readonly name: string
  readonly tag: string
}

const InstanceSubscription = ""

const matchesAny = (
  patterns: ReadonlyArray<string>,
  value: string,
): boolean => patterns.some((pattern) => new RegExp(pattern).test(value))

const dedupe = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  values.filter((value, index) => values.indexOf(value) === index)

const filterBySubscription = (
  candidates: ReadonlyArray<Candidate>,
  includeSubRegexes: ReadonlyArray<string>,
  excludeSubRegexes: ReadonlyArray<string>,
): ReadonlyArray<Candidate> =>
  candidates.filter(
    (candidate) =>
      candidate.subscription === InstanceSubscription ||
      ((includeSubRegexes.length === 0 ||
        matchesAny(includeSubRegexes, candidate.subscription)) &&
        !matchesAny(excludeSubRegexes, candidate.subscription)),
  )

const selectCandidates = (
  candidates: ReadonlyArray<Candidate>,
  includeRegexes: ReadonlyArray<string>,
  excludeRegexes: ReadonlyArray<string>,
): ReadonlyArray<Candidate> =>
  candidates.filter(
    (candidate) =>
      (includeRegexes.length === 0 ||
        matchesAny(includeRegexes, candidate.name)) &&
      !matchesAny(excludeRegexes, candidate.name),
  )

const tagsOf = (candidates: ReadonlyArray<Candidate>): ReadonlyArray<string> =>
  candidates.map((candidate) => candidate.tag)

const resolveMemberTags = (
  member: MemberRef,
  proxyCandidates: ReadonlyArray<Candidate>,
  nativeCandidates: ReadonlyArray<Candidate>,
  customCandidates: ReadonlyArray<Candidate>,
): ReadonlyArray<string> => {
  switch (member.type) {
    case "proxy":
      return tagsOf(
        proxyCandidates.filter(
          (candidate) =>
            candidate.subscription === member.subscription &&
            candidate.name === member.name,
        ),
      )
    case "nativeGroup":
      return tagsOf(
        nativeCandidates.filter(
          (candidate) =>
            candidate.subscription === member.subscription &&
            candidate.name === member.name,
        ),
      )
    case "customGroup":
      return tagsOf(
        customCandidates.filter((candidate) => candidate.name === member.name),
      )
  }
}

const describeMember = (member: MemberRef): string => {
  switch (member.type) {
    case "proxy":
      return `proxy ${member.subscription}/${member.name}`
    case "nativeGroup":
      return `nativeGroup ${member.subscription}/${member.name}`
    case "customGroup":
      return `customGroup ${member.name}`
  }
}

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
    case "EmptyCustomGroupError": {
      const samples =
        warning.samples.length === 0
          ? ""
          : ` (candidates: ${warning.samples.map((name) => JSON.stringify(name)).join(", ")})`
      return `${warning.scope}: custom group ${warning.group} matched no outbounds${samples}`
    }
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
}

interface BuiltCustomGroup {
  readonly outbound: Outbound | undefined
  readonly entry: TagEntry | undefined
  readonly warnings: ReadonlyArray<ConversionWarning>
  readonly error: EmptyCustomGroupError | undefined
}

const buildCustomGroup = (args: BuildCustomGroupArgs): BuiltCustomGroup => {
  const { group } = args

  const proxyPool = group.includeProxies
    ? filterBySubscription(
        args.proxyCandidates,
        group.includeSubRegexes,
        group.excludeSubRegexes,
      )
    : []
  const nativePool = group.includeNativeGroups
    ? filterBySubscription(
        args.nativeCandidates,
        group.includeSubRegexes,
        group.excludeSubRegexes,
      )
    : []
  const customPool = group.includeCustomGroups ? args.customCandidates : []

  const proxySelected = selectCandidates(
    proxyPool,
    group.includeRegexes,
    group.excludeRegexes,
  )
  const nativeSelected = selectCandidates(
    nativePool,
    group.includeRegexes,
    group.excludeRegexes,
  )
  const customSelected = selectCandidates(
    customPool,
    group.includeRegexes,
    group.excludeRegexes,
  )

  const memberResolutions = group.members.map((member) => ({
    member,
    tags: resolveMemberTags(
      member,
      args.proxyCandidates,
      args.nativeCandidates,
      args.customCandidates,
    ),
  }))

  const selected = dedupe([
    ...tagsOf(proxySelected),
    ...tagsOf(nativeSelected),
    ...tagsOf(customSelected),
    ...memberResolutions.flatMap((resolution) => resolution.tags),
    ...(group.includeDirect ? ["direct"] : []),
    ...(group.includeBlock ? ["block"] : []),
  ])

  const referenceWarnings: ReadonlyArray<ConversionWarning> =
    memberResolutions.flatMap((resolution) =>
      resolution.tags.length === 0
        ? [
            new MissingReferenceError({
              scope: args.scope,
              group: args.id,
              reference: describeMember(resolution.member),
            }),
          ]
        : [],
    )

  const selectedCandidates = [
    ...proxySelected,
    ...nativeSelected,
    ...customSelected,
  ]
  const defaultTag =
    group.default === null
      ? undefined
      : selectedCandidates.find(
          (candidate) => candidate.name === group.default,
        )?.tag
  const defaultWarnings: ReadonlyArray<ConversionWarning> =
    group.default !== null && defaultTag === undefined
      ? [
          new MissingReferenceError({
            scope: args.scope,
            group: args.id,
            reference: `default ${group.default}`,
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

  const samples = dedupe(
    [...proxyPool, ...nativePool, ...customPool].map(
      (candidate) => candidate.name,
    ),
  ).slice(0, 5)
  const emptyError = new EmptyCustomGroupError({
    scope: args.scope,
    group: args.id,
    samples,
  })
  return {
    outbound: undefined,
    entry: undefined,
    warnings: [...referenceWarnings, ...defaultWarnings, emptyError],
    error: group.onEmpty === "fail" ? emptyError : undefined,
  }
}

interface CustomGroupAccumulator {
  readonly outbounds: ReadonlyArray<Outbound>
  readonly entries: ReadonlyArray<TagEntry>
  readonly warnings: ReadonlyArray<ConversionWarning>
  readonly hardFail: boolean
}

const emptyCustomAccumulator: CustomGroupAccumulator = {
  outbounds: [],
  entries: [],
  warnings: [],
  hardFail: false,
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
          (native.includeRegexes.length === 0 ||
            matchesAny(native.includeRegexes, group.name)) &&
          !matchesAny(native.excludeRegexes, group.name),
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

  const baseNameMap = new Map<string, string>(
    [...proxies, ...nativeEntries].map((entry) => [entry.original, entry.tag]),
  )

  const nativeConversions = keptGroups.map((group) => ({
    group,
    conversion: convertGroup({
      group,
      tag: formatTag(format, subscription.name, group.name),
      resolve: (reference: string) =>
        baseNameMap.get(reference) ??
        (Object.hasOwn(BuiltinTags, reference)
          ? BuiltinTags[reference]
          : undefined),
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

  const proxyCandidates: ReadonlyArray<Candidate> = proxies.map((entry) => ({
    subscription: subscription.name,
    name: entry.original,
    tag: entry.tag,
  }))
  const nativeCandidates: ReadonlyArray<Candidate> = nativeEntries.map(
    (entry) => ({
      subscription: subscription.name,
      name: entry.original,
      tag: entry.tag,
    }),
  )

  const built =
    Object.entries(subscription.groups.custom).reduce<CustomGroupAccumulator>(
      (accumulator, [id, group]) => {
        const customCandidates: ReadonlyArray<Candidate> =
          accumulator.entries.map((entry) => ({
            subscription: subscription.name,
            name: entry.original,
            tag: entry.tag,
          }))
        const result = buildCustomGroup({
          scope: `subscriptions.${subscription.id}`,
          id,
          tag: formatTag(format, subscription.name, id),
          group,
          proxyCandidates,
          nativeCandidates,
          customCandidates,
        })
        return {
          outbounds:
            result.outbound === undefined
              ? accumulator.outbounds
              : [...accumulator.outbounds, result.outbound],
          entries:
            result.entry === undefined
              ? accumulator.entries
              : [...accumulator.entries, result.entry],
          warnings: [...accumulator.warnings, ...result.warnings],
          hardFail: accumulator.hardFail || result.error !== undefined,
        }
      },
      emptyCustomAccumulator,
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

  const proxyOutbounds: ReadonlyArray<Outbound> = keptProxies.map((proxy) =>
    convertProxy(proxy, formatTag(format, subscription.name, proxy.name)),
  )
  const nativeOutbounds: ReadonlyArray<Outbound> = nativeWithOutbounds.flatMap(
    ({ conversion }) =>
      conversion.outbound === undefined ? [] : [conversion.outbound],
  )

  const warnings: ReadonlyArray<ConversionWarning> = [
    ...decodeWarnings,
    ...missingWarnings,
    ...built.warnings,
  ]

  if (
    built.hardFail ||
    (subscription.onUnsupported === "fail" && warnings.length > 0)
  ) {
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
      outbounds: [...proxyOutbounds, ...nativeOutbounds, ...built.outbounds],
    },
    warnings,
    proxies,
    nativeGroups: nativeKept,
    customGroups: built.entries,
  })
}

interface InstanceAccumulator {
  readonly outbounds: ReadonlyArray<Outbound>
  readonly emitted: ReadonlyArray<Candidate>
  readonly warnings: ReadonlyArray<ConversionWarning>
  readonly error: EmptyCustomGroupError | undefined
}

const emptyInstanceAccumulator: InstanceAccumulator = {
  outbounds: [],
  emitted: [],
  warnings: [],
  error: undefined,
}

export const assembleFragment = (
  config: ResolvedConfig,
  fragments: ReadonlyArray<SubscriptionFragment>,
): Effect.Effect<AssembledFragment, DuplicateTagError | EmptyCustomGroupError> => {
  const proxyCandidates: ReadonlyArray<Candidate> = fragments.flatMap(
    (fragment) =>
      fragment.proxies.map((entry) => ({
        subscription: fragment.subscriptionName,
        name: entry.original,
        tag: entry.tag,
      })),
  )
  const nativeCandidates: ReadonlyArray<Candidate> = fragments.flatMap(
    (fragment) =>
      fragment.nativeGroups.map((entry) => ({
        subscription: fragment.subscriptionName,
        name: entry.original,
        tag: entry.tag,
      })),
  )
  const subscriptionCustomCandidates: ReadonlyArray<Candidate> =
    fragments.flatMap((fragment) =>
      fragment.customGroups.map((entry) => ({
        subscription: fragment.subscriptionName,
        name: entry.original,
        tag: entry.tag,
      })),
    )

  const built = Object.entries(config.groups.custom).reduce<InstanceAccumulator>(
    (accumulator, [id, group]) => {
      const customCandidates: ReadonlyArray<Candidate> = [
        ...subscriptionCustomCandidates,
        ...accumulator.emitted,
      ]
      const result = buildCustomGroup({
        scope: "groups",
        id,
        tag: id,
        group,
        proxyCandidates,
        nativeCandidates,
        customCandidates,
      })
      return {
        outbounds:
          result.outbound === undefined
            ? accumulator.outbounds
            : [...accumulator.outbounds, result.outbound],
        emitted:
          result.entry === undefined
            ? accumulator.emitted
            : [
                ...accumulator.emitted,
                {
                  subscription: InstanceSubscription,
                  name: id,
                  tag: id,
                },
              ],
        warnings: [...accumulator.warnings, ...result.warnings],
        error: accumulator.error ?? result.error,
      }
    },
    emptyInstanceAccumulator,
  )

  const baseOutbounds: ReadonlyArray<Outbound> = [
    ...fragments.flatMap((fragment) => fragment.fragment.outbounds),
    ...built.outbounds,
  ]
  const outbounds: ReadonlyArray<Outbound> = config.convert.emitBuiltinOutbounds
    ? [
        { type: "direct", tag: "direct" },
        { type: "block", tag: "block" },
        ...baseOutbounds,
      ]
    : baseOutbounds

  const tags = outbounds.map((outbound) => outbound.tag)
  const duplicates = dedupe(
    tags.filter((tag, index) => tags.indexOf(tag) !== index),
  )

  if (built.error !== undefined) {
    return Effect.fail(built.error)
  }
  if (duplicates.length > 0) {
    return Effect.fail(new DuplicateTagError({ tags: duplicates }))
  }

  return Effect.succeed({ fragment: { outbounds }, warnings: built.warnings })
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

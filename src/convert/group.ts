import type { CustomGroup } from "../config/schema"
import type { MihomoGroup } from "../mihomo/schema"
import type { Outbound } from "../singbox/schema"

export interface CustomGroupInput {
  readonly group: CustomGroup
  readonly tag: string
  readonly memberTags: ReadonlyArray<string>
  readonly defaultTag: string | undefined
}

export interface CustomGroupConversion {
  readonly outbound: Outbound | undefined
  readonly empty: boolean
}

export const convertCustomGroup = (
  input: CustomGroupInput,
): CustomGroupConversion => {
  const { group, tag, memberTags, defaultTag } = input
  if (memberTags.length === 0) {
    return { outbound: undefined, empty: true }
  }
  return group.type === "urltest"
    ? {
        outbound: {
          type: "urltest",
          tag,
          outbounds: memberTags,
          url: group.url,
          interval: `${group.intervalSeconds}s`,
          tolerance: group.tolerance,
          idle_timeout: `${group.idleTimeoutSeconds}s`,
          interrupt_exist_connections: group.interruptExistConnections,
        },
        empty: false,
      }
    : {
        outbound: {
          type: "selector",
          tag,
          outbounds: memberTags,
          default: defaultTag,
          interrupt_exist_connections: group.interruptExistConnections,
        },
        empty: false,
      }
}

export interface GroupConvertInput {
  readonly group: MihomoGroup
  readonly tag: string
  readonly resolve: (reference: string) => string | undefined
  readonly fallback: "urltest" | "skip"
  readonly loadBalance: "selector" | "urltest" | "skip"
}

export interface GroupConversion {
  readonly outbound: Outbound | undefined
  readonly missing: ReadonlyArray<string>
}

const resolveMembers = (
  group: MihomoGroup,
  resolve: (reference: string) => string | undefined,
): { readonly members: ReadonlyArray<string>; readonly missing: ReadonlyArray<string> } => {
  const references = group.proxies ?? []
  const resolved = references.map((reference) => ({
    reference,
    target: resolve(reference),
  }))
  return {
    members: resolved.flatMap((item) =>
      item.target === undefined ? [] : [item.target],
    ),
    missing: resolved.flatMap((item) =>
      item.target === undefined ? [item.reference] : [],
    ),
  }
}

export const convertGroup = (input: GroupConvertInput): GroupConversion => {
  const { group, tag, resolve } = input
  const { members, missing } = resolveMembers(group, resolve)

  if (members.length === 0) {
    return { outbound: undefined, missing }
  }

  switch (group.type) {
    case "select":
      return {
        outbound: {
          type: "selector",
          tag,
          outbounds: members,
        },
        missing,
      }
    case "url-test":
      return {
        outbound: {
          type: "urltest",
          tag,
          outbounds: members,
          url: group.url,
          interval:
            group.interval === undefined ? undefined : `${group.interval}s`,
          tolerance: group.tolerance,
        },
        missing,
      }
    case "fallback":
      return input.fallback === "skip"
        ? { outbound: undefined, missing }
        : {
            outbound: {
              type: "urltest",
              tag,
              outbounds: members,
              url: group.url,
              interval:
                group.interval === undefined
                  ? undefined
                  : `${group.interval}s`,
              tolerance: group.tolerance,
            },
            missing,
          }
    case "load-balance":
      switch (input.loadBalance) {
        case "skip":
          return { outbound: undefined, missing }
        case "urltest":
          return {
            outbound: {
              type: "urltest",
              tag,
              outbounds: members,
              url: group.url,
              interval:
                group.interval === undefined
                  ? undefined
                  : `${group.interval}s`,
              tolerance: group.tolerance,
            },
            missing,
          }
        case "selector":
          return {
            outbound: {
              type: "selector",
              tag,
              outbounds: members,
            },
            missing,
          }
      }
  }
}

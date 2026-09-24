import type { MihomoGroup } from "../mihomo/schema"
import type { Outbound } from "../singbox/schema"

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

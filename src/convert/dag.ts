import type { Outbound } from "../singbox/schema"

// sing-box rejects an outbound graph with a cycle. A group's members are edges,
// so the whole fragment must be a DAG. Proxies and other leaves simply have no
// outgoing edges.

const memberTags = (outbound: Outbound): ReadonlyArray<string> =>
  outbound.type === "selector" || outbound.type === "urltest"
    ? outbound.outbounds
    : []

export const findGroupCycle = (
  outbounds: ReadonlyArray<Outbound>,
): ReadonlyArray<string> | undefined => {
  const tags = outbounds.map((outbound) => outbound.tag)
  const edgesOf = (tag: string): ReadonlyArray<string> => {
    const outbound = outbounds.find((candidate) => candidate.tag === tag)
    return outbound === undefined ? [] : memberTags(outbound)
  }

  const empty = new Set<string>()
  const initial: Readonly<Record<string, ReadonlySet<string>>> =
    Object.fromEntries(tags.map((tag) => [tag, empty]))
  const step = (
    acc: Readonly<Record<string, ReadonlySet<string>>>,
  ): Readonly<Record<string, ReadonlySet<string>>> =>
    Object.fromEntries(
      tags.map((tag) => [
        tag,
        new Set([
          ...(acc[tag] ?? empty),
          ...edgesOf(tag).flatMap((member) => [
            member,
            ...(acc[member] ?? empty),
          ]),
        ]),
      ]),
    )

  // `tags.length` rounds are enough for the transitive closure to stabilise.
  const closure = Array.from({ length: tags.length + 1 }).reduce(step, initial)
  const cyclic = tags.filter((tag) => (closure[tag] ?? empty).has(tag))
  return cyclic.length === 0 ? undefined : cyclic
}

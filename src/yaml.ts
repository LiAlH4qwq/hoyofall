import { parse } from "yaml"

// `yaml.parse` is typed `any`; widen it once here (an implicit `any` widening,
// not a type assertion) so callers stay in `unknown` and decode with `Schema`.
export const parseYamlUnknown = (content: string): unknown => parse(content)

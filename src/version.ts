import pkg from "../package.json"

// Single source of truth for the version. The CLI, the Nix derivation and the
// Android module.prop all derive from this one field.
export const version: string = pkg.version

{
  description = "Development-only inputs for hoyofall. These are used by the dev partition of the top-level flake and never appear in a consumer's lock file.";

  inputs = {
    nixpkgs.url = "nixpkgs/nixpkgs-unstable";

    flake-parts.url = "github:hercules-ci/flake-parts";
    flake-parts.inputs.nixpkgs-lib.follows = "nixpkgs";

    github-actions-nix = {
      url = "github:synapdeck/github-actions-nix";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.flake-parts.follows = "flake-parts";
    };

    git-hooks = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # tsnix evaluates Nix expressions to JSON with no store; it powers the
    # Android WebUI's Nix config mode. Cross-built for Android (bionic) from
    # source, and used by the host for the Android config tests. It is
    # development-only: the top-level flake reads it back through this
    # partition so it never reaches a consumer's lock file.
    tsnix = {
      url = "github:lialh4qwq/tsnix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  # This flake only contributes its inputs to the dev partition.
  outputs = _: { };
}

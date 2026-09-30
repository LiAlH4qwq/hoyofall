{
  description = "hoyofall - a provably type-safe converter from mihomo (Clash.Meta) subscriptions into sing-box outbound fragments";

  inputs = {
    nixpkgs.url = "nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    flake-parts.inputs.nixpkgs-lib.follows = "nixpkgs";
    systems.url = "github:nix-systems/default";
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } (
      { config, withSystem, ... }:
      {
        systems = import inputs.systems;

        imports = [
          # Development tooling (workflow generation, git hooks, the website)
          # lives in the `dev` partition so it never reaches a consumer's
          # lock file. See `dev/flake.nix`.
          inputs.flake-parts.flakeModules.partitions
          ./nix/website.nix
        ];

        partitionedAttrs = {
          devShells = "dev";
          apps = "dev";
          checks = "dev";
        };

        partitions.dev = {
          extraInputsFlake = ./dev;
          module.imports = [ ./dev/flake-module.nix ];
        };

        perSystem =
          { config, system, ... }:
          let
            pkgs = import inputs.nixpkgs { inherit system; };

            hoyofall = pkgs.callPackage ./nix/package.nix {
              nodejs = pkgs.nodejs_26 or pkgs.nodejs;
              # Pin the pnpm major: its store format changes between majors, which
              # changes the fetchPnpmDeps hash. See nix/package.nix.
              pnpm = pkgs.pnpm_12 or pkgs.pnpm;
            };

            android = import ./nix/android.nix {
              inherit pkgs hoyofall;
              inherit (pkgs) lib;
              src = ./.;
            };
          in
          {
            packages.hoyofall = hoyofall;

            packages.default = config.packages.hoyofall;

            # Android (arm64): the flashable module assembled by nix/android.nix
            # from prebuilt Termux aarch64 binaries and the upstream sing-box
            # build, all fetched as fixed-output derivations.
            packages.hoyofall-android = android.module;

            formatter = pkgs.nixfmt;
          };

        flake.overlays.hoyofall = final: _prev: {
          hoyofall = withSystem final.stdenv.hostPlatform.system (ps: ps.config.packages.hoyofall);
        };

        flake.overlays.default = config.flake.overlays.hoyofall;

        flake.nixosModules.hoyofall = (import ./nix/module.nix) { inherit withSystem; };

        flake.nixosModules.default = config.flake.nixosModules.hoyofall;
      }
    );
}

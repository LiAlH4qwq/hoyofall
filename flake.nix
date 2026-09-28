{
  description = "hoyofall - convert mihomo (Clash.Meta) subscriptions into sing-box outbound fragments";

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

        perSystem =
          { config, system, ... }:
          let
            # `devShells.android` pulls nixpkgs' (unfree) Google NDK. Scope
            # `allowUnfree` to this flake's own pkgs instance so consumers do not
            # have to configure it.
            pkgs = import inputs.nixpkgs {
              inherit system;
              config.allowUnfree = true;
            };

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

            # Android (arm64). `hoyofall-android` is the flashable module built
            # from prebuilt Termux aarch64 binaries (fixed-output downloads) and
            # assembled with the repository's Nushell staging logic.
            packages.hoyofall-android = android.module;

            devShells.default = pkgs.mkShell {
              packages = [
                (pkgs.nodejs_26 or pkgs.nodejs)
                pkgs.pnpm
                pkgs.check-jsonschema
              ];
            };

            # Host toolchain + NDK for building the pinned subprojects from
            # source (`nu android/build.nu`). See nix/android.nix.
            devShells.android = android.devShell;

            formatter = pkgs.nixfmt-rfc-style;
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

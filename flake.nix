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
          { config, pkgs, ... }:
          {
            packages.hoyofall = pkgs.callPackage ./nix/package.nix {
              nodejs = pkgs.nodejs_26 or pkgs.nodejs;
              pnpm = pkgs.pnpm;
            };

            packages.default = config.packages.hoyofall;

            devShells.default = pkgs.mkShell {
              packages = [
                (pkgs.nodejs_26 or pkgs.nodejs)
                pkgs.pnpm
                pkgs.check-jsonschema
              ];
            };

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

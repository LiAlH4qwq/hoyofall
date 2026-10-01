{ lib, inputs, ... }:
{
  perSystem =
    {
      config,
      pkgs,
      system,
      ...
    }:
    let
      nodejs = pkgs.nodejs_26 or pkgs.nodejs;
    in
    {
      pre-commit = {
        # The `write-github` hook evaluates the flake (`nix run`), which needs
        # the store and network; it cannot run inside the `nix flake check`
        # sandbox, so disable that derived check.
        check.enable = false;

        settings = {
          hooks = {
            write-github = {
              enable = true;
              name = "write-github";
              description = "Regenerate .github from the Nix configuration";
              entry = "nix run .#write-github -- . --stage";
              files = "^(flake\\.(nix|lock)|dev/.*\\.nix|nix/.*\\.nix)$";
              pass_filenames = false;
              language = "system";
            };

            actionlint = {
              enable = true;
            };

            nixfmt = {
              enable = true;
            };
          };

          enabledPackages = [
            nodejs
            pkgs.pnpm
            pkgs.check-jsonschema
            pkgs.mdbook
            pkgs.actionlint
            # Host tsnix, so `pnpm check` can evaluate the Android Nix config
            # templates (test/android-nix.test.ts).
            inputs.tsnix.packages.${system}.tsnix
          ];
        };
      };
    };
}

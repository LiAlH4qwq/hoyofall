{ withSystem }:
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.hoyofall;
  yaml = pkgs.formats.yaml { };

  defaultPackage = withSystem pkgs.stdenv.hostPlatform.system (
    ps: ps.config.packages.hoyofall
  );

  runtimeDirectoryOf = name: "hoyofall-${name}";
  runtimePathOf = name: "/run/${runtimeDirectoryOf name}";

  # Point file output at the instance's RuntimeDirectory unless the user set
  # `output.file.path` / `output.file.directory` explicitly.
  withRuntimeOutputDefaults =
    name: settings:
    let
      output = settings.output or { };
      file = output.file or { };
    in
    settings
    // {
      output = output // {
        file = {
          path = "${runtimePathOf name}/hoyofall.json";
          directory = runtimePathOf name;
        } // file;
      };
    };

  instanceModule =
    { name, ... }:
    {
      options = {
        enable = lib.mkOption {
          type = lib.types.bool;
          default = true;
          description = "Whether to run this hoyofall instance.";
        };

        package = lib.mkOption {
          type = lib.types.package;
          default = cfg.package;
          defaultText = lib.literalExpression "config.services.hoyofall.package";
          description = "The hoyofall package to use for this instance.";
        };

        settings = lib.mkOption {
          type = lib.types.attrs;
          default = { };
          description = ''
            hoyofall configuration for this instance. Must conform to the
            JSON schema shipped at `share/hoyofall/schema.json`; it is
            validated with `check-jsonschema` at build time.

            When `output.file.path` / `output.file.directory` are not set, they
            default to the instance's RuntimeDirectory,
            `/run/hoyofall-<name>/hoyofall.json` and `/run/hoyofall-<name>`, so
            file output works without extra configuration. File outputs outside
            that directory need `extraReadWritePaths`.
          '';
        };

        configFile = lib.mkOption {
          type = lib.types.nullOr lib.types.path;
          default = null;
          description = ''
            Path to an existing YAML configuration file. When set, `settings`
            is ignored, including the RuntimeDirectory output defaults; make
            sure any configured output path is writable (see
            `extraReadWritePaths`). The file is still validated against the
            JSON schema.
          '';
        };

        environmentFile = lib.mkOption {
          type = lib.types.nullOr lib.types.path;
          default = null;
          description = ''
            Environment file used to resolve `urlEnv` references and keep
            subscription tokens out of the Nix store.
          '';
        };

        extraReadWritePaths = lib.mkOption {
          type = lib.types.listOf lib.types.str;
          default = [ ];
          description = "Additional writable paths for file output.";
        };
      };
    };

  validatedConfig =
    name: instance:
    let
      rendered =
        if instance.configFile != null then
          instance.configFile
        else
          yaml.generate "hoyofall-${name}.yaml" (withRuntimeOutputDefaults name instance.settings);
    in
    pkgs.runCommand "hoyofall-${name}.yaml" {
      nativeBuildInputs = [ pkgs.check-jsonschema ];
    } ''
      check-jsonschema --schemafile ${cfg.package}/share/hoyofall/schema.json ${rendered}
      cp ${rendered} $out
    '';
in
{
  options.services.hoyofall = {
    enable = lib.mkEnableOption "hoyofall, a mihomo to sing-box fragment converter";

    package = lib.mkOption {
      type = lib.types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "pkgs.hoyofall";
      description = "The hoyofall package to use.";
    };

    instances = lib.mkOption {
      type = lib.types.attrsOf (lib.types.submodule instanceModule);
      default = { };
      description = ''
        hoyofall instances. Each instance becomes a `hoyofall-<name>` systemd
        service. Most users only need a single instance (e.g. `default`), since
        one instance already handles multiple subscription URLs.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.targets = lib.mapAttrs' (
      name: _:
      lib.nameValuePair "hoyofall-${name}" {
        description = "hoyofall instance '${name}' target";
        requires = [ "hoyofall-${name}.service" ];
        after = [ "hoyofall-${name}.service" ];
        unitConfig.StopWhenUnneeded = true;
      }
    ) (lib.filterAttrs (_: instance: instance.enable) cfg.instances);

    systemd.services = lib.mapAttrs' (
      name: instance:
      lib.nameValuePair "hoyofall-${name}" {
        description = "hoyofall instance '${name}'";
        after = [
          "network.target"
          "network-online.target"
        ];
        wants = [
          "network.target"
          "network-online.target"
        ];
        wantedBy = [ "multi-user.target" ];

        serviceConfig = {
          ExecStart = "${instance.package}/bin/hoyofall --config ${validatedConfig name instance}";
          Restart = "on-failure";
          EnvironmentFile = lib.mkIf (instance.environmentFile != null) [
            instance.environmentFile
          ];
          DynamicUser = true;
          RuntimeDirectory = runtimeDirectoryOf name;
          RuntimeDirectoryMode = "0700";
          WorkingDirectory = runtimePathOf name;
          ReadWritePaths = [ (runtimePathOf name) ] ++ instance.extraReadWritePaths;
          ProtectSystem = "strict";
          ProtectHome = true;
          PrivateTmp = true;
          NoNewPrivileges = true;
          RestrictAddressFamilies = [
            "AF_INET"
            "AF_INET6"
            "AF_UNIX"
            "AF_NETLINK"
          ];
        };
      }
    ) (lib.filterAttrs (_: instance: instance.enable) cfg.instances);
  };
}

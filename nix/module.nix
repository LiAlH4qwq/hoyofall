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

  runtimeDirectory = "hoyofall";
  runtimePath = "/run/${runtimeDirectory}";
  fragmentPath = "${runtimePath}/hoyofall.json";

  # Point file output at the service RuntimeDirectory unless set explicitly.
  withRuntimeOutputDefaults =
    settings:
    let
      output = settings.output or { };
      file = output.file or { };
    in
    settings
    // {
      output = output // {
        file = {
          path = fragmentPath;
          directory = runtimePath;
        } // file;
      };
    };

  rendered = yaml.generate "hoyofall.yaml" (withRuntimeOutputDefaults cfg.settings);

  validatedConfig =
    if cfg.configFile != null then
      cfg.configFile
    else
      pkgs.runCommand "hoyofall.yaml" {
        nativeBuildInputs = [ pkgs.check-jsonschema ];
      } ''
        check-jsonschema --schemafile ${cfg.package}/share/hoyofall/schema.json ${rendered}
        cp ${rendered} $out
      '';

  singbox = cfg.singboxIntegration;
  # systemd.services keys omit the `.service` suffix; ordering deps keep it.
  singboxServiceKey = lib.removeSuffix ".service" singbox.service;
  injected = "/run/${singbox.runtimeDirectory}/${singbox.fragmentName}";

  # All module scripts are Nushell (never bash). Prefer Nushell builtins
  # (`mkdir`/`cp`/`path exists`/`hash sha256`/`sleep`); only `systemctl` is an
  # external command, resolved from the default unit PATH.
  writeNu = pkgs.writers.writeNu;

  injectScript = writeNu "hoyofall-inject-singbox" ''
    mkdir "/run/${singbox.runtimeDirectory}"
    let deadline = (date now) + 120sec
    while ((date now) < $deadline) and (not ("${fragmentPath}" | path exists)) {
      sleep 1sec
    }
    cp --force "${fragmentPath}" "${injected}"
  '';

  refreshScript = writeNu "hoyofall-singbox-refresh" ''
    sleep 1sec
    if ("${fragmentPath}" | path exists) {
      let source = (open --raw "${fragmentPath}" | hash sha256)
      let target = (if ("${injected}" | path exists) { open --raw "${injected}" | hash sha256 } else { "" })
      if $source != $target {
        cp --force "${fragmentPath}" "${injected}"
        ^systemctl restart "${singbox.service}"
      }
    }
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

    settings = lib.mkOption {
      type = lib.types.attrs;
      default = { };
      description = ''
        hoyofall configuration. Must conform to the JSON schema shipped at
        `share/hoyofall/schema.json`; it is validated with `check-jsonschema` at
        build time.

        When `output.file.path` / `output.file.directory` are not set, they
        default to the service RuntimeDirectory,
        `/run/hoyofall/hoyofall.json` and `/run/hoyofall`. File outputs outside
        that directory need `extraReadWritePaths`.
      '';
    };

    configFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = ''
        Path to an existing YAML configuration file. When set, `settings` is
        ignored, including the RuntimeDirectory output defaults; make sure any
        configured output path is writable (see `extraReadWritePaths`). The file
        is still validated against the JSON schema.
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

    singboxIntegration = {
      enable = lib.mkEnableOption ''
        merge the hoyofall fragment into `services.sing-box`. The module installs
        a root oneshot that copies the fragment into sing-box's config directory
        and (optionally) restarts sing-box when the fragment changes
      '';

      service = lib.mkOption {
        type = lib.types.str;
        default = "sing-box.service";
        description = "The sing-box systemd service to inject into.";
      };

      runtimeDirectory = lib.mkOption {
        type = lib.types.str;
        default = "sing-box";
        description = ''
          The sing-box unit's `RuntimeDirectory` (the `-C` config directory).
          Must match what `services.sing-box` uses.
        '';
      };

      fragmentName = lib.mkOption {
        type = lib.types.str;
        default = "zz-hoyofall.json";
        description = "Filename of the injected fragment (must end in .json).";
      };

      restartOnChange = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = ''
          Watch the fragment and restart sing-box when it changes. sing-box only
          reads its configuration at startup, so this is needed to pick up
          refreshed subscriptions.
        '';
      };
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = !singbox.enable || config.services.sing-box.enable;
        message = "services.hoyofall.singboxIntegration requires services.sing-box.enable = true.";
      }
    ];

    systemd.services.hoyofall = {
      description = "hoyofall - mihomo to sing-box fragment converter";
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
        ExecStart = "${cfg.package}/bin/hoyofall --config ${validatedConfig}";
        Restart = "on-failure";
        EnvironmentFile = lib.mkIf (cfg.environmentFile != null) [
          cfg.environmentFile
        ];
        DynamicUser = true;
        RuntimeDirectory = runtimeDirectory;
        RuntimeDirectoryMode = "0700";
        WorkingDirectory = runtimePath;
        ReadWritePaths = [ runtimePath ] ++ cfg.extraReadWritePaths;
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
    };

    systemd.services.hoyofall-inject-singbox = lib.mkIf singbox.enable {
      description = "Inject the hoyofall fragment into ${singbox.service}";
      wants = [ "hoyofall.service" ];
      after = [ "hoyofall.service" ];
      before = [ singbox.service ];
      requiredBy = [ singbox.service ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        TimeoutStartSec = 180;
        ExecStart = "${injectScript}";
      };
    };

    systemd.services.hoyofall-singbox-refresh = lib.mkIf (singbox.enable && singbox.restartOnChange) {
      description = "Re-inject the hoyofall fragment and restart ${singbox.service}";
      serviceConfig = {
        Type = "oneshot";
        ExecStart = "${refreshScript}";
      };
    };

    systemd.paths.hoyofall-singbox-refresh = lib.mkIf (singbox.enable && singbox.restartOnChange) {
      wantedBy = [ "multi-user.target" ];
      after = [ "hoyofall.service" ];
      pathConfig.PathChanged = runtimePath;
    };

    # Keep the injected file across sing-box restarts.
    systemd.services.${singboxServiceKey}.serviceConfig.RuntimeDirectoryPreserve =
      lib.mkIf singbox.enable "yes";
  };
}

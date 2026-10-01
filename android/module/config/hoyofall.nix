# hoyofall configuration source for the WebUI's Nix mode.
#
# The supervisor renders this on device with tsnix (a store-less Nix
# evaluator): `tsnix eval -f config.nix --io local --format json`, then writes
# the YAML to config.yaml. Local `import ./other.nix` works; store builtins
# (derivation, fetchurl, …) do not, because there is no Nix store on Android.
#
# Subscription tokens belong in hoyofall.env (referenced here with urlEnv), so
# this file stays free of secrets.
{
  groups = {
    custom = {
      auto = {
        level = 1;
        type = "urltest";
        includeProxies = true;
        includeRegexes = [ ];
        onEmpty = "skip";
      };
      proxy = {
        level = 2;
        type = "selector";
        includeProxies = true;
        includeLevels = [ 1 ];
        includeDirect = true;
        onEmpty = "skip";
      };
    };
  };

  convert = {
    emitBuiltinOutbounds = false;
    proxyNameFormat = "{sub}-{name}";
  };

  subscriptions = {
    default = {
      name = "default";
      urlEnv = "HOYOFALL_SUB_URL";
      intervalSeconds = 86400;
      format = "auto";
      onUnsupported = "skip";
    };
  };

  output = {
    file = {
      enabled = true;
      mode = "aggregate";
      path = "/data/adb/hoyofall/hoyofall/out/fragment.json";
      permissions = "0644";
      pretty = true;
    };
    http = {
      enabled = false;
      listen = {
        host = "127.0.0.1";
        port = 9090;
      };
    };
  };
}

# sing-box configuration source for the WebUI's Nix mode.
#
# The supervisor renders this on device with tsnix (a store-less Nix
# evaluator); it is merged with hoyofall's fragment (`-C`), so route through a
# hoyofall group by setting route.final below.
{
  log = {
    level = "info";
    timestamp = true;
  };

  inbounds = [
    {
      type = "mixed";
      tag = "mixed-in";
      listen = "127.0.0.1";
      listen_port = 7890;
    }
  ];

  outbounds = [
    {
      type = "direct";
      tag = "direct";
    }
  ];

  route = {
    final = "direct";
  };
}

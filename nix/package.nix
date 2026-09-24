{
  lib,
  stdenv,
  fetchPnpmDeps,
  pnpmConfigHook,
  pnpmBuildHook,
  makeWrapper,
  nodejs,
  pnpm,
}:

stdenv.mkDerivation (finalAttrs: {
  pname = "hoyofall";
  version = "0.1.0";

  src = lib.cleanSourceWith {
    src = ../.;
    filter =
      path: _type:
      !(builtins.elem (baseNameOf (toString path)) [
        "node_modules"
        "dist"
        "result"
        ".direnv"
        ".pnpm-store"
      ]);
  };

  __structuredAttrs = true;
  strictDeps = true;

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 4;
    hash = "sha256-DG9bqGWsqJlJluHf9dMAuuuyEsIzwxVhyB0Ygj4LwYw=";
  };

  nativeBuildInputs = [
    nodejs
    pnpm
    pnpmConfigHook
    pnpmBuildHook
    makeWrapper
  ];

  pnpmBuildScript = "build";

  env.CI = "true";

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/hoyofall $out/bin $out/share/hoyofall
    cp dist/index.js $out/lib/hoyofall/index.js
    if [ -f dist/index.js.map ]; then
      cp dist/index.js.map $out/lib/hoyofall/index.js.map
    fi
    cp dist/schema.json $out/share/hoyofall/schema.json

    makeWrapper ${lib.getExe' nodejs "node"} $out/bin/hoyofall \
      --add-flags "$out/lib/hoyofall/index.js"

    runHook postInstall
  '';

  meta = {
    description = "Convert mihomo (Clash.Meta) subscriptions into sing-box outbound fragments";
    license = lib.licenses.mit;
    mainProgram = "hoyofall";
    platforms = lib.platforms.unix;
  };
})

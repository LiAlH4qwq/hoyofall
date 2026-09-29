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

let
  # `fetchPnpmDeps` runs `pnpm install --force`, which fetches dependencies for
  # every platform, so its output is usually identical across systems; `default`
  # covers those. If a platform's store genuinely differs, add an override keyed
  # by `stdenv.hostPlatform.system` (the build then tells you the `got:` hash).
  #
  # To regenerate: set the value to `lib.fakeHash`, run `nix build .#hoyofall` on
  # that system, and copy the `got: sha256-…` value. Remember to do this when the
  # pnpm major changes, since its store format is not stable across majors (we
  # pin pnpm to a major in flake.nix for exactly this reason).
  pnpmDepsHashes = {
    default = "sha256-tTzJaxhjtuIPOHleNjdCF/QlhhC6vuaYgavHcLg6zOA=";
    # x86_64-linux = "sha256-…";
    # aarch64-linux = "sha256-…";
    # x86_64-darwin = "sha256-…";
    # aarch64-darwin = "sha256-…";
  };

  system = stdenv.hostPlatform.system;

  pnpmDepsHash = pnpmDepsHashes.${system} or pnpmDepsHashes.default;

  # Single source of truth for the version: the root package.json. The CLI
  # (`src/version.ts`) and the Android module read the same field.
  version = (builtins.fromJSON (builtins.readFile ../package.json)).version;
in

stdenv.mkDerivation (finalAttrs: {
  pname = "hoyofall";
  inherit version;

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
    hash = pnpmDepsHash;
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
    # KernelSU module WebUI, bundled by `pnpm build` (android/webui -> webroot).
    cp -r android/module/webroot $out/share/hoyofall/webroot

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

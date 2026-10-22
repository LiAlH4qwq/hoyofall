{
  lib,
  stdenv,
  stdenvNoCC,
  fetchurl,
  autoPatchelfHook,
  nodejs-slim,
}:

let
  version = "12.3.4";

  sources = {
    x86_64-linux = {
      package = "exe.linux-x64";
      hash = "sha256-mxyV/EE2AMp1pR6+gzLXAZ3DVo/UGH9aXy30oVbvtlw=";
    };
    aarch64-linux = {
      package = "exe.linux-arm64";
      hash = "sha256-q1Nm6VLbwoETQhp8fd/bBMm7ZClYuPU+pVg4VEJr1I0=";
    };
    x86_64-linux-musl = {
      package = "exe.linux-x64-musl";
      hash = "sha256-SsTn+4Czuk/7DkQ62rVTnedYHV2g8pUBhZsweFcxqg4=";
    };
    aarch64-linux-musl = {
      package = "exe.linux-arm64-musl";
      hash = "sha256-CF9jicQSEF2+GKQgmsNaKzVehXRM1bhGlwvCH6pJoiw=";
    };
    x86_64-darwin = {
      package = "exe.darwin-x64";
      hash = "sha256-3kEPwxUxsbekQMjoDeHPdmPMMp/lMKUjJIIT8bL5bK8=";
    };
    aarch64-darwin = {
      package = "exe.darwin-arm64";
      hash = "sha256-9UrTZ9ikLa+dhIMOS9akXAlX4OMoekXaCMOguNBOx/c=";
    };
  };

  system = stdenvNoCC.hostPlatform.system;
  platform =
    system
    + lib.optionalString (stdenvNoCC.hostPlatform.isMusl && !(lib.hasSuffix "-musl" system)) "-musl";
  source = sources.${platform} or (throw "pnpm ${version} has no prebuilt binary for ${platform}");
in
stdenvNoCC.mkDerivation {
  pname = "pnpm";
  inherit version;

  src = fetchurl {
    url = "https://registry.npmjs.org/@pnpm/${source.package}/-/${source.package}-${version}.tgz";
    inherit (source) hash;
  };

  nativeBuildInputs = lib.optionals stdenvNoCC.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenvNoCC.hostPlatform.isLinux [ stdenv.cc.cc.lib ];

  dontBuild = true;

  installPhase = ''
    runHook preInstall
    install -Dm755 pnpm $out/bin/pnpm
    runHook postInstall
  '';

  passthru = {
    inherit nodejs-slim;
    majorVersion = lib.versions.major version;
  };

  meta = {
    description = "Fast, disk space efficient package manager";
    homepage = "https://pnpm.io/";
    license = lib.licenses.mit;
    mainProgram = "pnpm";
  };
}

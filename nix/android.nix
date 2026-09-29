# Android integration for the flake.
#
# The all-in-one flashable module is assembled from **prebuilt binaries**:
# Termux aarch64 packages (Node, Nushell, their libraries and a CA bundle) plus
# the upstream SagerNet sing-box Android build. Every download is a
# fixed-output derivation, so it happens before the build and the build phases
# run offline. There is no cross-compilation here: no NDK or Rust toolchain is
# involved.
{
  pkgs,
  lib,
  src,
  hoyofall,
}:

let
  termuxBase = "https://packages.termux.dev/apt/termux-main";
  deb =
    path: hash:
    pkgs.fetchurl {
      url = "${termuxBase}/${path}";
      inherit hash;
    };

  # Termux `stable` (aarch64), pinned 2026-09.
  nodejsDeb = deb "pool/main/n/nodejs/nodejs_26.4.0-1_aarch64.deb" "sha256-6vPtim5LcuuqjCyzutd4xXfN+eqHypF2EhPYo5QPwJA=";
  nushellDeb = deb "pool/main/n/nushell/nushell_0.116.0_aarch64.deb" "sha256-E0/2SV1I5Tuv5IKZAaoH2GB0NliTVzOxUfESRY4A93g=";
  libcxxDeb = deb "pool/main/libc/libc++/libc++_30_aarch64.deb" "sha256-U9C4SnunRZAkJXy5TVsTb+E++FhWf2WoBks1lQeZ8so=";
  opensslDeb = deb "pool/main/o/openssl/openssl_1:3.6.3_aarch64.deb" "sha256-hnYOnOc29GMjbywVses6P9z8V3jQ/XB3qRdEjcyQ86o=";
  caresDeb = deb "pool/main/c/c-ares/c-ares_1.34.8_aarch64.deb" "sha256-doH8I+gi15iLqLKt80aPk65o9yTdo2XP8ThQlqn6h+Y=";
  libicuDeb = deb "pool/main/libi/libicu/libicu_78.3_aarch64.deb" "sha256-9TZAP2Wgj+DfbnMEGE6QLVTe931cO9Xt/ZEJ1XYB0nY=";
  libsqliteDeb = deb "pool/main/libs/libsqlite/libsqlite_3.53.4_aarch64.deb" "sha256-DpCc4NUP4SMwVEbNIuDF7fU11ANEubBl+9ze5S9TGY0=";
  zlibDeb = deb "pool/main/z/zlib/zlib_1.3.2_aarch64.deb" "sha256-defQrxf8w7QABDCf3ACh3bmuCDRtzl4mmQLDSsOWask=";
  libffiDeb = deb "pool/main/libf/libffi/libffi_3.8.0_aarch64.deb" "sha256-TyVbrfdM0x9qKAHBf6FEQZnITINLUXt8hD4v6evpHXc=";
  caDeb = deb "pool/main/c/ca-certificates/ca-certificates_1:2026.08.13_all.deb" "sha256-jolPuIXac4tMqaeTJwPkFNcw+jLnirozBGp0eCJUfVo=";

  # nodejs pulls its native deps; ca-certificates comes via openssl.
  runtimeDebs = [
    nodejsDeb
    nushellDeb
    libcxxDeb
    opensslDeb
    caresDeb
    libicuDeb
    libsqliteDeb
    zlibDeb
    libffiDeb
    caDeb
  ];

  singbox = pkgs.fetchurl {
    url = "https://github.com/SagerNet/sing-box/releases/download/v1.14.2/sing-box-1.14.2-android-arm64.tar.gz";
    hash = "sha256-V+64GGeppeQGvLtff941Ks3DVOjAhBc6KL3ZQXxeDLo=";
  };

  cleanedSrc = lib.cleanSourceWith {
    src = src;
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

  termuxPrefix = "data/data/com.termux/files/usr";

  # Derive a monotonic Magisk versionCode from the SemVer version (no
  # pre-releases): major*10000 + minor*100 + patch.
  versionParts = lib.splitVersion hoyofall.version;
  versionPart = n: lib.toInt (builtins.elemAt versionParts n);
  versionCode = versionPart 0 * 10000 + versionPart 1 * 100 + versionPart 2;

in
{
  module =
    pkgs.runCommand "hoyofall-android-arm64-${hoyofall.version}"
      {
        nativeBuildInputs = [
          pkgs.dpkg
          pkgs.findutils
          pkgs.coreutils
          pkgs.xz
          pkgs.zstd
          pkgs.gnutar
          pkgs.gzip
          pkgs.zip
        ];
        meta = {
          description = "hoyofall all-in-one flashable module for Android (arm64)";
          # The module aggregates MIT hoyofall with bundled third-party binaries;
          # sing-box is GPL-3.0-or-later. See THIRD_PARTY_LICENSES.md.
          license = with lib.licenses; [
            mit
            gpl3Plus
            asl20
            mpl20
            llvm-exception
            unicode-30
            zlib
          ];
          platforms = lib.platforms.unix;
        };
      }
      ''
        export HOME=$TMPDIR
        prefix=${termuxPrefix}

        i=0
        for archive in ${lib.concatStringsSep " " runtimeDebs}; do
          i=$((i + 1))
          mkdir -p "$TMPDIR/x/$i"
          dpkg-deb -x "$archive" "$TMPDIR/x/$i"
        done

        node=$(find "$TMPDIR/x" -path "*/$prefix/bin/node" -type f | head -n1)
        nu=$(find "$TMPDIR/x" -path "*/$prefix/bin/nu" -type f | head -n1)
        cert=$(find "$TMPDIR/x" -path "*/$prefix/etc/tls/cert.pem" -type f | head -n1)
        [[ -n "$node" && -n "$nu" && -n "$cert" ]]

        mkdir -p "$TMPDIR/prebuilt/lib"
        # Exact SONAMEs the binaries need (see `readelf -d`); dereference symlinks
        # so the module works even if the installer's unzip drops symlinks.
        needed="libc++_shared.so libcares.so libcrypto.so.3 libssl.so.3 libffi.so libicudata.so.78 libicui18n.so.78 libicuuc.so.78 libsqlite3.so libz.so.1"
        for name in $needed; do
          source=$(find "$TMPDIR/x" -name "$name" \( -type f -o -type l \) | head -n1)
          [[ -n "$source" ]]
          cp -L "$source" "$TMPDIR/prebuilt/lib/$name"
        done

        mkdir -p "$TMPDIR/singbox"
        tar -xzf ${singbox} -C "$TMPDIR/singbox"
        singboxBin=$(find "$TMPDIR/singbox" -name sing-box -type f | head -n1)
        [[ -n "$singboxBin" ]]

        # Stage the Magisk/KernelSU module tree.
        stage="$TMPDIR/module"
        cp -r ${cleanedSrc}/android/module "$stage"
        chmod -R u+w "$stage"
        mkdir -p "$stage/bin" "$stage/lib"
        cp "$node" "$stage/bin/node"
        cp "$nu" "$stage/bin/nu"
        cp "$singboxBin" "$stage/bin/sing-box"
        cp ${hoyofall}/lib/hoyofall/index.js "$stage/index.js"
        cp ${hoyofall}/share/hoyofall/schema.json "$stage/schema.json"
        rm -rf "$stage/webroot"
        cp -a ${hoyofall}/share/hoyofall/webroot "$stage/webroot"
        cp -r ${cleanedSrc}/licenses "$stage/licenses"
        cp ${cleanedSrc}/THIRD_PARTY_LICENSES.md "$stage/THIRD_PARTY_LICENSES.md"
        cp -L "$TMPDIR/prebuilt/lib/"*.so* "$stage/lib/"
        mkdir -p "$stage/etc/ssl"
        cp "$cert" "$stage/etc/ssl/cert.pem"

        # The committed module.prop is a version-less template; stamp both fields
        # from the package version (`hoyofall.version`).
        props="$stage/module.prop"
        sed -e '/^version=/d' -e '/^versionCode=/d' "$props" > "$props.tmp"
        printf 'version=v%s\nversionCode=%s\n' "${hoyofall.version}" "${toString versionCode}" >> "$props.tmp"
        mv "$props.tmp" "$props"

        chmod 0755 "$stage"/bin/* "$stage"/*.sh

        mkdir -p "$out"
        cp -a "$stage" "$out/module"
        (cd "$stage" && zip -r -9 "$out/hoyofall-android-arm64.zip" .)
      '';
}

# Android integration for the flake.
#
# nixpkgs' Android cross toolchain (`pkgsCross.aarch64-android*`) is not in the
# binary cache and is broken when built from source (compiler-rt, tzdata, …), and
# a sandboxed build of Node/Nushell for Android needs an online Rust target. So
# the flashable module is assembled from **prebuilt Termux aarch64 binaries**,
# fetched as fixed-output derivations (so all downloads happen before the build
# and the build phases run offline).
#
# `devShell` remains available for building the pinned subprojects from source
# against an NDK (`nu android/build.nu`).
#
# Pinned package versions/hashes are from the Termux `stable` aarch64 index; see
# docs/android.md for how to refresh them.
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

  module =
    pkgs.runCommand "hoyofall-android-arm64-${hoyofall.version}"
      {
        nativeBuildInputs = [
          pkgs.dpkg
          pkgs.findutils
          pkgs.coreutils
          pkgs.xz
          pkgs.zstd
          pkgs.nushell
          pkgs.zip
        ];
        passthru = {
          inherit runtimeDebs;
        };
        meta = {
          description = "hoyofall flashable module for Android (arm64, prebuilt Termux payload)";
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

            nu --no-config-file ${cleanedSrc}/android/build.nu \
              --root ${cleanedSrc} \
              --stage-only \
              --arch arm64 \
              --node-bin "$node" \
              --nu-bin "$nu" \
              --bundle ${hoyofall}/lib/hoyofall/index.js \
              --schema ${hoyofall}/share/hoyofall/schema.json \
              --lib-dir "$TMPDIR/prebuilt/lib" \
              --cert "$cert" \
              --out "$TMPDIR/module"

            mkdir -p "$out"
            cp -a "$TMPDIR/module" "$out/module"

            nu --no-config-file ${cleanedSrc}/android/package.nu \
              --root ${cleanedSrc} \
              --input "$TMPDIR/module" \
              --out "$out/hoyofall-android-arm64.zip"
      '';

  devShell = pkgs.mkShell {
    packages = [
      (pkgs.nodejs_26 or pkgs.nodejs)
      pkgs.pnpm
      pkgs.cargo
      pkgs.rustc
      pkgs.rustup
      pkgs.zip
      pkgs.curl
      pkgs.gnumake
      pkgs.python3
      pkgs.patch
      pkgs.pkg-config
      pkgs.nushell
      pkgs.androidenv.androidPkgs.ndk-bundle
    ];

    ANDROID_NDK_ROOT = "${pkgs.androidenv.androidPkgs.ndk-bundle}";
  };
in
{
  inherit module devShell runtimeDebs;
}

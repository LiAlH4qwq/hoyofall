# Cross-build tsnix (the store-less Nix evaluator) for Android aarch64 against
# bionic, so the module ships a small, dynamically linked binary instead of a
# static blob. tsnix is pure Rust, so nixpkgs' Android cross rustPlatform is
# enough; no extra NDK plumbing is needed.
#
# The Android SDK/NDK downloads are unfree, so this file uses its own nixpkgs
# instance with `allowUnfree` set; the rest of the flake stays unfree-free.
{
  nixpkgs,
  system,
  tsnixSrc,
}:
let
  pkgs = import nixpkgs {
    inherit system;
    config.allowUnfree = true;
  };
  cross = pkgs.pkgsCross.aarch64-android-prebuilt;
  constants = import (tsnixSrc + "/nix/constants.nix");
in
(import (tsnixSrc + "/nix/package.nix") {
  inherit (cross) rustPlatform;
  lib = cross.lib;
  snixSourceHash = constants.snixSourceHash;
}).overrideAttrs
  (_: {
    # The produced binaries are Android aarch64; cargo tests cannot run here.
    doCheck = false;
  })

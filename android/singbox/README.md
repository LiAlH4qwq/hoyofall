# android/singbox

The all-in-one module bundles a prebuilt **sing-box** for Android (arm64) next
to Node and Nushell, and supervises it alongside hoyofall.

- For the Nix build, `nix/android.nix` fetches
  `sing-box-<version>-android-arm64.tar.gz` from the SagerNet releases as a
  fixed-output derivation (SHA-256 pinned in `versions.lock`).
- For the script path, `fetch.nu` downloads and checksum-verifies the same
  tarball (`nu android/singbox/fetch.nu`); `android/build.nu` calls it.

The Android build is self-contained (it only needs bionic `liblog`/`libc`), so
no extra shared libraries are bundled. `versions.lock` pins the version, URL and
SHA-256; refresh them together when bumping sing-box.

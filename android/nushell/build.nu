#!/usr/bin/env nu
# Cross-compile Nushell for Android using the Android NDK and Cargo.
#
# This repository bans bash: this script is Nushell, like every authored script.
# It downloads the pinned Nushell source, verifies its checksum, applies the
# vendored Termux patch, builds the reduced feature set for the Rust Android
# target, strips, and stages `nu` (plus `libc++_shared.so` when needed).
#
# Usage, from the repository root:
#   nu android/nushell/build.nu --arch arm64 --ndk "$ANDROID_NDK_ROOT"
#
# Pinned inputs live in `android/nushell/versions.lock`.

def arch-map [arch: string] {
  match $arch {
    "arm64" => { rust_target: "aarch64-linux-android", clang_prefix: "aarch64-linux-android" }
    "aarch64" => { rust_target: "aarch64-linux-android", clang_prefix: "aarch64-linux-android" }
    "x86_64" => { rust_target: "x86_64-linux-android", clang_prefix: "x86_64-linux-android" }
    _ => { error make { msg: $"unsupported --arch ($arch): use arm64 or x86_64" } }
  }
}

def host-tag [] {
  match ($nu.os-info.name) {
    "linux" => "linux-x86_64"
    "macos" => "darwin-x86_64"
    _ => { error make { msg: $"unsupported build host ($nu.os-info.name)" } }
  }
}

def check [code: int, what: string] {
  if $code != 0 {
    error make { msg: $"($what) failed (exit ($code))" }
  }
}

def sha256-of [path: path] {
  open $path --raw | hash sha256
}

def main [
  --root: string = ""        # repository root (defaults to this script's repo)
  --source: string = ""      # use an already-extracted Nushell source tree
  --arch: string = "arm64"   # arm64 | x86_64
  --ndk: string = ""         # path to the Android NDK (or ANDROID_NDK_ROOT)
  --api: string = ""         # Android API level (defaults to versions.lock)
  --features: string = ""    # extra Cargo features (e.g. "network,rustls-tls")
  --jobs: int = 0            # cargo parallelism (0 = CPU count)
  --out: string = ""         # output directory (default android/dist/nu-<arch>)
  --force                    # re-download and rebuild from scratch
] {
  let root = (if $root != "" { $root } else { $env.FILE_PWD | path dirname | path dirname })
  let lock = (open ($root | path join "android" "nushell" "versions.lock") --raw | from toml)

  let arch = (match $arch {
    "arm64" => "arm64"
    "aarch64" => "arm64"
    "x86_64" => "x86_64"
    _ => { error make { msg: $"unsupported --arch ($arch): use arm64 or x86_64" } }
  })
  let mapping = (arch-map $arch)
  let host = (host-tag)
  let api = (if $api == "" { $lock.api_level } else { $api })
  let jobs = (if $jobs == 0 { (sys cpu | length) } else { $jobs })
  let features = (if $features != "" { $features } else { $lock.default_features })

  let cargo = (which cargo | get path | first | default "")
  if $cargo == "" {
    error make { msg: "cargo not found on PATH; install a Rust toolchain (see versions.lock rust_version)" }
  }

  let ndkEnv = ($env.ANDROID_NDK_ROOT? | default ($env.ANDROID_NDK_HOME? | default ""))
  let ndk = (if $ndk != "" { $ndk } else { $ndkEnv })
  if $ndk == "" {
    error make { msg: "no NDK given: pass --ndk or set ANDROID_NDK_ROOT/ANDROID_NDK_HOME" }
  }
  if not ($ndk | path exists) {
    error make { msg: $"NDK path does not exist: ($ndk)" }
  }
  let props = ($ndk | path join "source.properties")
  if not ($props | path exists) {
    error make { msg: $"($ndk) is not an Android NDK (no source.properties)" }
  }
  let revision = (open $props --raw
    | lines
    | where {|line| $line | str starts-with "Pkg.Revision" }
    | first
    | split row "="
    | last
    | str trim)
  print -e $"NDK ($ndk) revision ($revision), Nushell ($lock.nushell_version), arch ($arch), api ($api)"

  let toolchain = ($ndk | path join "toolchains" "llvm" "prebuilt" $host)
  if not ($toolchain | path exists) {
    error make { msg: $"NDK toolchain not found: ($toolchain)" }
  }
  let binDir = ($toolchain | path join "bin")
  let clang = ($binDir | path join $"($mapping.clang_prefix)($api)-clang")
  let clangxx = ($binDir | path join $"($mapping.clang_prefix)($api)-clang++")
  let llvmAr = ($binDir | path join "llvm-ar")
  let strip = ($binDir | path join "llvm-strip")
  let readelf = ($binDir | path join "llvm-readelf")

  if (which rustup | is-not-empty) {
    let installed = (^rustup target list --installed | lines)
    if not ($installed | any {|target| $target == $mapping.rust_target }) {
      print -e $"adding Rust target ($mapping.rust_target)"
      ^rustup target add $mapping.rust_target
      check $env.LAST_EXIT_CODE "rustup target add"
    }
  }

  let src = (if $source != "" {
    $source
  } else {
    let cache = ($root | path join "android" ".cache")
    mkdir $cache
    let tarball = ($cache | path join $lock.nushell_tarball)
    let valid = (($tarball | path exists) and ((sha256-of $tarball) == $lock.nushell_sha256))
    if $force or (not $valid) {
      print -e $"downloading ($lock.nushell_url)"
      ^curl -fL $lock.nushell_url -o $tarball
      check $env.LAST_EXIT_CODE "curl (nushell source)"
    }
    let actual = (sha256-of $tarball)
    if $actual != $lock.nushell_sha256 {
      error make { msg: $"checksum mismatch for ($lock.nushell_tarball): got ($actual)" }
    }
    let buildRoot = ($root | path join "android" "build" $"nushell-($arch)")
    if $force {
      rm -rf $buildRoot
    }
    mkdir $buildRoot
    ^tar -xf $tarball -C $buildRoot
    check $env.LAST_EXIT_CODE "tar (extract nushell source)"
    $buildRoot | path join $"nushell-($lock.nushell_version)"
  })
  if not ($src | path exists) {
    error make { msg: $"nushell source not found at ($src)" }
  }

  let patches = (glob ($root | path join "android" "nushell" "patches" "termux" "*.patch") | sort)
  $patches | each {|patch|
    print -e $"applying ($patch | path basename)"
    ^patch -p1 -d $src -i $patch
    check $env.LAST_EXIT_CODE $"patch ($patch | path basename)"
  }

  # Rust's build scripts look these up as CC_<triple>, CXX_<triple>, AR_<triple>.
  let ccKey = ($"CC_($mapping.rust_target | str replace -a "-" "_")")
  let cxxKey = ($"CXX_($mapping.rust_target | str replace -a "-" "_")")
  let arKey = ($"AR_($mapping.rust_target | str replace -a "-" "_")")
  let linkerKey = ($"CARGO_TARGET_($mapping.rust_target | str upcase | str replace -a "-" "_")_LINKER")
  let envRecord = (
    [
      { key: $ccKey, value: $clang }
      { key: $cxxKey, value: $clangxx }
      { key: $arKey, value: $llvmAr }
      { key: $linkerKey, value: $clang }
    ] | reduce --fold {} {|pair, acc| $acc | insert $pair.key $pair.value }
  )
  load-env $envRecord
  $env.ANDROID_NDK_ROOT = $ndk
  $env.PATH = ($env.PATH | prepend $binDir)

  cd $src
  let featureArgs = (if $features == "" { [] } else { ["--features" $features] })
  print -e $"building Nushell (release, features='($features)') with ($jobs) jobs"
  ^cargo build --release --target $mapping.rust_target --no-default-features --jobs $jobs ...$featureArgs
  check $env.LAST_EXIT_CODE "cargo build"

  let out = (if $out != "" { $out } else { $root | path join "android" "dist" $"nu-($arch)" })
  mkdir $out
  let built = ($src | path join "target" $mapping.rust_target "release" "nu")
  if not ($built | path exists) {
    error make { msg: $"build produced no nu binary at ($built)" }
  }
  ^$strip --strip-all $built
  check $env.LAST_EXIT_CODE "llvm-strip"
  cp $built ($out | path join "nu")

  let targetBin = ($out | path join "nu")
  let needsCxx = ((^$readelf -d $targetBin) | str contains "libc++_shared.so")
  if $needsCxx {
    let candidates = (glob ($ndk | path join "toolchains" "llvm" "prebuilt" $host "sysroot" "usr" "lib" "**" "libc++_shared.so")
      | where {|candidate| $candidate | str contains $mapping.clang_prefix })
    if ($candidates | length) == 0 {
      error make { msg: "nu links libc++_shared.so but the NDK sysroot copy was not found" }
    }
    mkdir ($out | path join "lib")
    cp ($candidates | first) ($out | path join "lib" "libc++_shared.so")
    print -e "staged libc++_shared.so (set LD_LIBRARY_PATH to the module's lib dir)"
  }

  print $"nushell ($lock.nushell_version) for Android ($arch) staged at ($out)"
  print $"  binary: ($targetBin)"
}

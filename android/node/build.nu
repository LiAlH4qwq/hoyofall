#!/usr/bin/env nu
# Cross-compile Node.js for Android using the Android NDK.
#
# This repository bans bash: this script is Nushell, like every authored script.
# It downloads the pinned Node source, verifies its checksum, applies the
# vendored Termux patches, configures for Android, builds, strips, and stages
# the `node` binary (and `libc++_shared.so` when the binary needs it).
#
# Usage, from the repository root:
#   nu android/node/build.nu --arch arm64 --ndk "$ANDROID_NDK_ROOT"
#
# Pinned inputs live in `android/node/versions.lock`.

def arch-map [arch: string] {
  match $arch {
    "arm64" => { dest_cpu: "arm64", clang_prefix: "aarch64-linux-android", gyp_arch: "arm64" }
    "aarch64" => { dest_cpu: "arm64", clang_prefix: "aarch64-linux-android", gyp_arch: "arm64" }
    "x86_64" => { dest_cpu: "x64", clang_prefix: "x86_64-linux-android", gyp_arch: "x64" }
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
  --source: string = ""      # use an already-extracted Node source tree
  --arch: string = "arm64"   # arm64 | x86_64
  --ndk: string = ""         # path to the Android NDK (or ANDROID_NDK_ROOT)
  --api: string = ""         # Android API level (defaults to versions.lock)
  --intl: string = "none"    # none | small
  --jobs: int = 0            # make parallelism (0 = CPU count)
  --out: string = ""         # output directory (default android/dist/node-<arch>)
  --force                    # re-download and rebuild from scratch
] {
  let root = (if $root != "" { $root } else { $env.FILE_PWD | path dirname | path dirname })
  let lock = (open ($root | path join "android" "node" "versions.lock") --raw | from toml)

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
  print -e $"NDK ($ndk) revision ($revision), Node ($lock.node_version), arch ($arch), api ($api)"

  let toolchain = ($ndk | path join "toolchains" "llvm" "prebuilt" $host)
  if not ($toolchain | path exists) {
    error make { msg: $"NDK toolchain not found: ($toolchain)" }
  }
  let binDir = ($toolchain | path join "bin")
  let cc = ($binDir | path join $"($mapping.clang_prefix)($api)-clang")
  let cxx = ($binDir | path join $"($mapping.clang_prefix)($api)-clang++")
  let strip = ($binDir | path join "llvm-strip")
  let readelf = ($binDir | path join "llvm-readelf")

  let src = (if $source != "" {
    $source
  } else {
    let cache = ($root | path join "android" ".cache")
    mkdir $cache
    let tarball = ($cache | path join $lock.node_tarball)
    let valid = (($tarball | path exists) and ((sha256-of $tarball) == $lock.node_sha256))
    if $force or (not $valid) {
      print -e $"downloading ($lock.node_url)"
      ^curl -fL $lock.node_url -o $tarball
      check $env.LAST_EXIT_CODE "curl (node source)"
    }
    let actual = (sha256-of $tarball)
    if $actual != $lock.node_sha256 {
      error make { msg: $"checksum mismatch for ($lock.node_tarball): got ($actual)" }
    }
    let buildRoot = ($root | path join "android" "build" $"node-($arch)")
    if $force {
      rm -rf $buildRoot
    }
    mkdir $buildRoot
    ^tar -xf $tarball -C $buildRoot
    check $env.LAST_EXIT_CODE "tar (extract node source)"
    $buildRoot | path join $"node-v($lock.node_version)"
  })
  if not ($src | path exists) {
    error make { msg: $"node source not found at ($src)" }
  }

  let patches = (glob ($root | path join "android" "node" "patches" "termux" "*.patch") | sort)
  if ($patches | length) == 0 {
    error make { msg: "no Termux patches found under android/node/patches/termux" }
  }
  $patches | each {|patch|
    print -e $"applying ($patch | path basename)"
    ^patch -p1 -d $src -i $patch
    check $env.LAST_EXIT_CODE $"patch ($patch | path basename)"
  }

  $env.PATH = ($env.PATH | prepend $binDir)
  $env.CC = $cc
  $env.CXX = $cxx
  $env.ANDROID_NDK_ROOT = $ndk
  $env.GYP_DEFINES = $"target_arch=($mapping.gyp_arch) v8_target_arch=($mapping.gyp_arch) android_target_arch=($mapping.gyp_arch) host_os=($host) OS=android android_ndk_path=($ndk)"
  let intlFlag = (if $intl == "small" { "--with-intl=small-icu" } else { "--without-intl" })

  cd $src
  print -e $"configuring Node ($lock.node_version)"
  ^./configure --dest-cpu=$mapping.dest_cpu --dest-os=android --openssl-no-asm --cross-compiling --without-npm $intlFlag
  check $env.LAST_EXIT_CODE "configure"

  print -e $"building Node with ($jobs) jobs"
  ^make -j $jobs
  check $env.LAST_EXIT_CODE "make"

  let out = (if $out != "" { $out } else { $root | path join "android" "dist" $"node-($arch)" })
  mkdir $out
  let built = ($src | path join "out" "Release" "node")
  if not ($built | path exists) {
    error make { msg: $"build produced no node binary at ($built)" }
  }
  ^$strip --strip-all $built
  check $env.LAST_EXIT_CODE "llvm-strip"
  cp $built ($out | path join "node")

  let targetBin = ($out | path join "node")
  let needsCxx = ((^$readelf -d $targetBin) | str contains "libc++_shared.so")
  if $needsCxx {
    let candidates = (glob ($ndk | path join "toolchains" "llvm" "prebuilt" $host "sysroot" "usr" "lib" "**" "libc++_shared.so")
      | where {|candidate| $candidate | str contains $mapping.clang_prefix })
    if ($candidates | length) == 0 {
      error make { msg: "node links libc++_shared.so but the NDK sysroot copy was not found" }
    }
    mkdir ($out | path join "lib")
    cp ($candidates | first) ($out | path join "lib" "libc++_shared.so")
    print -e "staged libc++_shared.so (set LD_LIBRARY_PATH to the module's lib dir)"
  }

  print $"node ($lock.node_version) for Android ($arch) staged at ($out)"
  print $"  binary: ($targetBin)"
}

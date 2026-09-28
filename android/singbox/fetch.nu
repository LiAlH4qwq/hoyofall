#!/usr/bin/env nu
# Fetch the pinned prebuilt sing-box for Android (arm64).
#
# Nushell only: bash is banned. `nix build .#hoyofall-android` uses a
# fixed-output derivation instead; this is for the script path.
#
# Usage, from the repository root:
#   nu android/singbox/fetch.nu --arch arm64
#   # -> android/dist/sing-box-arm64/sing-box

def check [code: int, what: string] {
  if $code != 0 {
    error make { msg: $"($what) failed (exit ($code))" }
  }
}

def sha256-of [path: path] {
  open $path --raw | hash sha256
}

def main [
  --root: string = ""       # repository root (defaults to this script's repo)
  --arch: string = "arm64"  # arm64 (x86_64 not published for this target yet)
  --out: string = ""        # output directory (default android/dist/sing-box-<arch>)
  --force                   # re-download
] {
  let root = (if $root != "" { $root } else { $env.FILE_PWD | path dirname | path dirname })
  let lock = (open ($root | path join "android" "singbox" "versions.lock") --raw | from toml)
  if $arch != "arm64" {
    error make { msg: $"sing-box prebuilt is only wired for arm64, not ($arch)" }
  }

  let cache = ($root | path join "android" ".cache")
  mkdir $cache
  let tarball = ($cache | path join $"sing-box-($lock.singbox_version)-android-($arch).tar.gz")
  let valid = (($tarball | path exists) and ((sha256-of $tarball) == $lock.singbox_sha256))
  if $force or (not $valid) {
    print -e $"downloading ($lock.singbox_url)"
    ^curl -fL $lock.singbox_url -o $tarball
    check $env.LAST_EXIT_CODE "curl (sing-box)"
  }
  let actual = (sha256-of $tarball)
  if $actual != $lock.singbox_sha256 {
    error make { msg: $"checksum mismatch for sing-box: got ($actual)" }
  }

  let buildRoot = ($root | path join "android" "build" $"sing-box-($arch)")
  rm -rf $buildRoot
  mkdir $buildRoot
  ^tar -xzf $tarball -C $buildRoot
  check $env.LAST_EXIT_CODE "tar (extract sing-box)"
  let built = (glob ($buildRoot | path join "**" "sing-box") | first)
  if ($built == null) {
    error make { msg: "sing-box binary not found in the archive" }
  }

  let out = (if $out != "" { $out } else { $root | path join "android" "dist" $"sing-box-($arch)" })
  mkdir $out
  cp $built ($out | path join "sing-box")
  ^chmod 0755 ($out | path join "sing-box")
  print $"sing-box ($lock.singbox_version) for Android ($arch) staged at ($out)"
}

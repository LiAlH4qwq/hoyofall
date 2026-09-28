#!/usr/bin/env nu
# Assemble the flashable Magisk/KernelSU module zip.
#
# Usage, from the repository root:
#   nu android/build.nu --arch arm64 --ndk "$ANDROID_NDK_ROOT"
#   nu android/package.nu --arch arm64
#
# Requires `zip` on the build host. The output is a Magisk-format module that
# also installs on KernelSU / SuKiSU / ReSuKiSU.

def main [
  --root: string = ""        # repository root (defaults to this script's repo)
  --arch: string = "arm64"   # arm64 | x86_64
  --input: string = ""       # staged module dir (default android/dist/module-<arch>)
  --out: string = ""         # output zip (default android/dist/hoyofall-android-<arch>.zip)
] {
  let root = (if $root != "" { $root } else { $env.FILE_PWD | path dirname })
  let arch = (match $arch {
    "arm64" => "arm64"
    "aarch64" => "arm64"
    "x86_64" => "x86_64"
    _ => { error make { msg: $"unsupported --arch ($arch): use arm64 or x86_64" } }
  })
  let input = (if $input != "" { $input } else { $root | path join "android" "dist" $"module-($arch)" })
  # Resolve to an absolute path before `cd`-ing into the input directory.
  let out = (if $out != "" { $out | path expand } else { $root | path join "android" "dist" $"hoyofall-android-($arch).zip" })

  if not ($input | path exists) {
    error make { msg: $"($input) does not exist; run `nu android/build.nu` first" }
  }
  if (which zip | is-empty) {
    error make { msg: "`zip` not found on PATH; install it (the module must be a zip)" }
  }

  rm -f $out
  cd $input
  ^zip -r -9 $out .
  if $env.LAST_EXIT_CODE != 0 {
    error make { msg: "zip failed" }
  }

  let size = (ls $out | get size | first)
  print $"wrote ($out) ($size)"
}

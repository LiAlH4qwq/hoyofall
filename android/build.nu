#!/usr/bin/env nu
# Cross-compile the Android payload: Node, Nushell, and the module tree.
#
# This orchestration is Nushell because bash is banned in this repository.
#
# Two ways to use it:
#   * script build (pinned versions, downloads sources, applies Termux patches):
#       nu android/build.nu --arch arm64 --ndk "$ANDROID_NDK_ROOT"
#   * stage-only (reuse prebuilt binaries, e.g. the Termux payload the Nix
#     flake downloads):
#       nu android/build.nu --stage-only --arch arm64 \
#          --node-bin /nix/store/.../bin/node --nu-bin /nix/store/.../bin/nu \
#          --bundle dist/index.js --schema dist/schema.json --out ./module
#
# The Nix flake uses the stage-only path so the module is assembled with the
# same logic whether the binaries came from Nix or from the subprojects.

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

def resolve-root [root: string] {
  if $root != "" { $root } else { $env.FILE_PWD | path dirname }
}

def optional-flag [name: string, value: string] {
  if $value == "" { [] } else { [$name, $value] }
}

# Copy a native shared library from a package root (`<bin>/../lib/...`) when the
# binary links it. On Android libc++ is often shared.
def stage-libcxx [bin: path, libDir: path] {
  let candidate = ($bin | path dirname | path dirname | path join "lib" "libc++_shared.so")
  if ($candidate | path exists) {
    cp $candidate ($libDir | path join "libc++_shared.so")
  }
}

def stage [
  root: path
  staging: path
  nodeBin: path
  nuBin: path
  bundle: path
  schema: path
  libDir: string
  cert: string
] {
  for required in [$nodeBin $nuBin $bundle $schema] {
    if not ($required | path exists) {
      error make { msg: $"cannot stage: ($required) does not exist" }
    }
  }

  rm -rf $staging
  cp -r ($root | path join "android" "module") $staging
  # The module tree comes from the (read-only) Nix store; make it writable.
  ^chmod -R u+w $staging
  mkdir ($staging | path join "bin")
  mkdir ($staging | path join "lib")

  cp $nodeBin ($staging | path join "bin" "node")
  cp $nuBin ($staging | path join "bin" "nu")
  cp $bundle ($staging | path join "index.js")
  cp $schema ($staging | path join "schema.json")
  stage-libcxx $nodeBin ($staging | path join "lib")
  stage-libcxx $nuBin ($staging | path join "lib")

  # Prebuilt (Termux) payloads ship their shared libraries and CA bundle; copy
  # them in so the launcher's LD_LIBRARY_PATH resolves them on device.
  if $libDir != "" {
    glob ($libDir | path join "*.so*") | each {|library|
      cp $library ($staging | path join "lib" ($library | path basename))
    }
  }
  if $cert != "" {
    mkdir ($staging | path join "etc" "ssl")
    cp $cert ($staging | path join "etc" "ssl" "cert.pem")
  }

  # Stamp the module version from package.json. Materialize before saving,
  # otherwise `save -f` truncates the file that `open` is still streaming.
  let version = (open ($root | path join "package.json") | get version)
  let propsPath = ($staging | path join "module.prop")
  let updatedProps = (open $propsPath
    | lines
    | each {|line|
        if ($line | str starts-with "version=") { $"version=v($version)" } else { $line }
      }
    | str join "\n")
  $updatedProps | save -f $propsPath

  ^chmod 0755 ($staging | path join "bin" "node") ($staging | path join "bin" "nu")
  ^chmod 0755 ($staging | path join "service.sh") ($staging | path join "post-fs-data.sh") ($staging | path join "action.sh") ($staging | path join "uninstall.sh")
}

def main [
  --root: string = ""         # repository root (defaults to this script's repo)
  --arch: string = "arm64"    # arm64 | x86_64
  --ndk: string = ""          # path to the Android NDK (or ANDROID_NDK_ROOT)
  --features: string = ""     # extra Cargo features for Nushell
  --stage-only                # skip builds; stage from already-built binaries
  --node-bin: string = ""     # source `node` binary (stage-only)
  --nu-bin: string = ""       # source `nu` binary (stage-only)
  --bundle: string = ""       # source index.js (stage-only)
  --schema: string = ""       # source schema.json (stage-only)
  --lib-dir: string = ""      # directory of *.so* to bundle (stage-only)
  --cert: string = ""         # CA bundle to bundle as etc/ssl/cert.pem (stage-only)
  --out: string = ""          # staging directory
  --skip-node                 # reuse android/dist/node-<arch>
  --skip-nushell              # reuse android/dist/nu-<arch>
  --force                     # pass --force to the sub-builds
] {
  let root = (resolve-root $root)
  let arch = (match $arch {
    "arm64" => "arm64"
    "aarch64" => "arm64"
    "x86_64" => "x86_64"
    _ => { error make { msg: $"unsupported --arch ($arch): use arm64 or x86_64" } }
  })
  let staging = (if $out != "" { $out } else { $root | path join "android" "dist" $"module-($arch)" })
  let nodeDir = ($root | path join "android" "dist" $"node-($arch)")
  let nuDir = ($root | path join "android" "dist" $"nu-($arch)")

  if $stage_only {
    let nodeBin = (if $node_bin != "" { $node_bin } else { $nodeDir | path join "node" })
    let nuBin = (if $nu_bin != "" { $nu_bin } else { $nuDir | path join "nu" })
    let bundle = (if $bundle != "" { $bundle } else { $root | path join "dist" "index.js" })
    let schema = (if $schema != "" { $schema } else { $root | path join "dist" "schema.json" })
    stage $root $staging $nodeBin $nuBin $bundle $schema $lib_dir $cert
    print $"module tree staged at ($staging)"
    return
  }

  let ndkFlags = (optional-flag "--ndk" $ndk)
  let forceFlags = (if $force { ["--force"] } else { [] })

  if not $skip_node {
    ^nu ($root | path join "android" "node" "build.nu") --root $root --arch $arch ...$ndkFlags ...$forceFlags
    check $env.LAST_EXIT_CODE "android/node/build.nu"
  }
  if not $skip_nushell {
    let featureFlags = (optional-flag "--features" $features)
    ^nu ($root | path join "android" "nushell" "build.nu") --root $root --arch $arch ...$ndkFlags ...$featureFlags ...$forceFlags
    check $env.LAST_EXIT_CODE "android/nushell/build.nu"
  }

  # The web bundle is produced by `pnpm build`; build it if absent.
  let bundle = ($root | path join "dist" "index.js")
  if not ($bundle | path exists) {
    print -e "dist/index.js missing; running pnpm build"
    ^pnpm build
    check $env.LAST_EXIT_CODE "pnpm build"
  }

  stage $root $staging ($nodeDir | path join "node") ($nuDir | path join "nu") $bundle ($root | path join "dist" "schema.json") "" ""
  print $"module tree staged at ($staging)"
  print $"  next: nu android/package.nu --arch ($arch)"
}

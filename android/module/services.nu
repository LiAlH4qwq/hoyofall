# Shared service definitions for the supervisor (service.nu) and the control
# panel (control.nu). Both load it with `use ./services.nu *`.
#
# A service is a supervised long-running process: its `bin`/`args`, its `config`
# file, its `log`, and a `flag` file whose presence means "stopped" (so the
# supervisor keeps running and `start` can bring the process back without a
# reboot). Adding a service is a new arm here plus its binary/config in the
# module.

export const MODULE = "/data/adb/modules/hoyofall"
export const DATA = "/data/adb/hoyofall"
# Per-app data directories under the global data dir. `android.conf` (the
# supervisor settings) is the only file that lives at the data-dir root.
export const HOYOFALL_DIR = "/data/adb/hoyofall/hoyofall"
export const SINGBOX_DIR = "/data/adb/hoyofall/sing-box"

export def service-names [] {
  [ "hoyofall" "sing-box" ]
}

export def service-spec [name: string] {
  match $name {
    "hoyofall" => {
      name: "hoyofall"
      bin: ($MODULE | path join "bin" "node")
      args: [
        ($MODULE | path join "index.js")
        "--config"
        ($HOYOFALL_DIR | path join "config.yaml")
      ]
      config: ($HOYOFALL_DIR | path join "config.yaml")
      log: ($HOYOFALL_DIR | path join "log" "hoyofall.log")
      flag: ($HOYOFALL_DIR | path join "disabled")
    }
    "sing-box" => {
      name: "sing-box"
      bin: ($MODULE | path join "bin" "sing-box")
      # `-D` is sing-box's working directory: its cache (cache.db, and any
      # Clash-API external UI it downloads) lands under sing-box/cache.
      args: [
        "run"
        "-c"
        ($SINGBOX_DIR | path join "config.json")
        "-C"
        ($HOYOFALL_DIR | path join "out")
        "-D"
        ($SINGBOX_DIR | path join "cache")
      ]
      config: ($SINGBOX_DIR | path join "config.json")
      log: ($SINGBOX_DIR | path join "log" "sing-box.log")
      flag: ($SINGBOX_DIR | path join "disabled")
    }
    _ => { error make { msg: $"unknown service ($name): hoyofall | sing-box" } }
  }
}

export def pids [pattern: string] {
  try {
    ^pgrep -f $pattern | lines | each {|line| $line | into int }
  } catch {
    []
  }
}

export def service-status [name: string] {
  let spec = (service-spec $name)
  {
    enabled: (not ($spec.flag | path exists))
    running: ((pids $spec.bin | length) > 0)
    supervisor: ((pids "service.nu" | length) > 0)
  }
}

export def stop-service [name: string] {
  let spec = (service-spec $name)
  pids $spec.bin | each {|pid|
    try {
      kill $pid
    } catch {|error|
      print -e $"[hoyofall] could not stop ($name) pid ($pid): ($error.msg)"
    }
  }
}

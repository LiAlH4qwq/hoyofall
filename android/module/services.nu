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
        ($DATA | path join "config.yaml")
      ]
      config: ($DATA | path join "config.yaml")
      log: ($DATA | path join "log" "hoyofall.log")
      flag: ($DATA | path join "disabled")
    }
    "sing-box" => {
      name: "sing-box"
      bin: ($MODULE | path join "bin" "sing-box")
      args: [
        "run"
        "-c"
        ($DATA | path join "singbox" "config.json")
        "-C"
        ($DATA | path join "out")
      ]
      config: ($DATA | path join "singbox" "config.json")
      log: ($DATA | path join "singbox" "sing-box.log")
      flag: ($DATA | path join "singbox" "disabled")
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

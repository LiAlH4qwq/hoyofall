#!/usr/bin/env nu
# hoyofall Android module: control panel backend.
#
# Called from the KernelSU WebUI (through the `kernelsu` exec API) or by hand:
#   nu control.nu <action> [service]
#
# actions: status | start | stop | restart | config | set-config | log
# service: hoyofall | sing-box   (status may omit it to list every service)
#
# `set-config` reads the new file body from $env.HOYOFALL_CONFIG_B64 (base64).
# start/stop use the service's flag file, honoured by the supervisors in
# service.nu, so the supervisor stays alive and `start` needs no reboot.

use ./services.nu *

def require-service [service: string] {
  if $service == "" {
    error make { msg: "this action needs a service: hoyofall | sing-box" }
  }
  service-spec $service | ignore
}

def main [action: string = "status", service: string = ""] {
  mkdir $DATA
  match $action {
    "status" => {
      let rows = (
        (if $service == "" { service-names } else { [ $service ] })
        | each {|name| { service: $name, ...(service-status $name) } }
      )
      print (if ($rows | length) == 1 { $rows.0 | reject service | to json -r } else { $rows | to json -r })
    }
    "start" => {
      require-service $service
      let spec = (service-spec $service)
      rm -f $spec.flag
      stop-service $service
      print ((service-status $service) | to json -r)
    }
    "stop" => {
      require-service $service
      let spec = (service-spec $service)
      mkdir ($spec.flag | path dirname)
      touch $spec.flag
      stop-service $service
      print ((service-status $service) | to json -r)
    }
    "restart" => {
      require-service $service
      stop-service $service
      print ((service-status $service) | to json -r)
    }
    "config" => {
      require-service $service
      let spec = (service-spec $service)
      print (open $spec.config --raw)
    }
    "set-config" => {
      require-service $service
      let spec = (service-spec $service)
      let encoded = ($env.HOYOFALL_CONFIG_B64? | default "")
      if $encoded == "" {
        error make { msg: "set-config: HOYOFALL_CONFIG_B64 is empty" }
      }
      # Atomic write: materialise next to the target, then rename, so a crash
      # cannot leave a half-written config for the supervisor to restart-loop on.
      let temp = $"($spec.config).tmp-($nu.pid)"
      $encoded | decode base64 | decode utf-8 | save -f --raw $temp
      mv -f $temp $spec.config
      print "ok"
    }
    "log" => {
      require-service $service
      let spec = (service-spec $service)
      if ($spec.log | path exists) {
        print (open $spec.log | lines | last 300 | str join "\n")
      } else {
        print ""
      }
    }
    _ => { error make { msg: $"unknown action ($action): status|start|stop|restart|config|set-config|log" } }
  }
}

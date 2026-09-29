#!/usr/bin/env nu
# hoyofall Android module: control panel backend.
#
# Called from the KernelSU WebUI (through the `kernelsu` exec API) or by hand:
#   nu control.nu <action> [service]
#
# actions: status | start | stop | restart | config | set-config |
#          config-source | render-config | set-source | log
# service: hoyofall | sing-box   (status may omit it to list every service)
#
# `set-config` reads the new file body from $env.HOYOFALL_CONFIG_B64 (base64).
# `set-source` reads a Nushell source document from the same variable, renders
# it to the service's config format and validates it before committing.
# start/stop use the service's flag file, honoured by the supervisors in
# service.nu, so the supervisor stays alive and `start` needs no reboot.

use ./services.nu *

def require-service [service: string] {
  if $service == "" {
    error make { msg: "this action needs a service: hoyofall | sing-box" }
  }
  service-spec $service | ignore
}

# Evaluate a service's Nushell source document ($spec.source) and serialise the
# record it evaluates to. `source` only accepts a parse-time constant path, so
# the file is evaluated in a child `nu -c` whose command string embeds the path
# (module paths are fixed, never user input).
def render-source [spec: record] {
  if not ($spec.source | path exists) {
    error make { msg: $"no Nushell source at ($spec.source)" }
  }
  let serialize = match $spec.format {
    "yaml" => "to yaml"
    "json" => "to json"
    _ => { error make { msg: $"unknown format ($spec.format)" } }
  }
  # Build the child command by concatenation: a `$"…"` interpolation around
  # `source (…)` would make the outer parser try to resolve it at parse time.
  let quote = "'"
  let body = "let c = (source " + $quote + ($spec.source | into string) + $quote + "); $c | " + $serialize
  ^$nu.current-exe --no-config-file -c $body
}

# Validate candidate config text with the service's own checker before it
# replaces the live file. No-op when the service has no checker. The checker's
# diagnostics are folded into the error so the caller (the WebUI) sees them.
def validate-config [spec: record, content: string] {
  if ($spec.check | is-empty) {
    return
  }
  let temp = $"($spec.config).tmp-check-($nu.pid)"
  $content | save -f --raw $temp
  let result = (run-external ...$spec.check $temp | complete)
  rm -f $temp
  if $result.exit_code != 0 {
    let detail = (if ($result.stderr | str trim) == "" { $result.stdout } else { $result.stderr })
    error make { msg: $"config validation failed:\n($detail | str trim)" }
  }
}

# Write `content` next to the target then rename, so a crash cannot leave a
# half-written config for the supervisor to restart-loop on.
def commit-config [target: path, content: string] {
  let temp = $"($target).tmp-($nu.pid)"
  $content | save -f --raw $temp
  mv -f $temp $target
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
    "config-source" => {
      require-service $service
      let spec = (service-spec $service)
      print (if ($spec.source | path exists) { open $spec.source --raw } else { "" })
    }
    "set-config" => {
      require-service $service
      let spec = (service-spec $service)
      let encoded = ($env.HOYOFALL_CONFIG_B64? | default "")
      if $encoded == "" {
        error make { msg: "set-config: HOYOFALL_CONFIG_B64 is empty" }
      }
      let text = ($encoded | decode base64 | decode utf-8)
      validate-config $spec $text
      commit-config $spec.config $text
      print "ok"
    }
    # Render the Nushell source and print it without touching the live config
    # (the WebUI's preview).
    "render-config" => {
      require-service $service
      let spec = (service-spec $service)
      print (render-source $spec)
    }
    # Save the Nushell source document, render + validate it, and only then
    # replace the live config. A render or validation failure leaves the running
    # config untouched; the source is still saved so edits are not lost.
    "set-source" => {
      require-service $service
      let spec = (service-spec $service)
      let encoded = ($env.HOYOFALL_CONFIG_B64? | default "")
      if $encoded == "" {
        error make { msg: "set-source: HOYOFALL_CONFIG_B64 is empty" }
      }
      commit-config $spec.source ($encoded | decode base64 | decode utf-8)
      let rendered = (render-source $spec)
      validate-config $spec $rendered
      commit-config $spec.config $rendered
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
    _ => { error make { msg: $"unknown action ($action): status|start|stop|restart|config|config-source|set-config|render-config|set-source|log" } }
  }
}

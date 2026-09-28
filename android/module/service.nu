#!/usr/bin/env nu
# hoyofall Android module: supervise the services and inject the fragment.
#
# Runs from service.sh (the shim `exec`s this file) at late_start. Magisk and
# KernelSU start service scripts asynchronously, so blocking here is correct:
# the process stays alive and supervises its services (hoyofall, sing-box).
#
# All logic is Nushell; the .sh shim is the only permitted shell file.

use ./services.nu *

# Poll the aggregate fragment and, on change, copy it into an *external*
# sing-box module's config directory and run the configured reload hook.
# (The bundled sing-box reads /data/adb/hoyofall/out via `-C`; this is for users
# who run a separate sing-box module.)
def watch-loop [
  outFile: path
  targetDir: string
  targetName: string
  reload: list<string>
  interval: int
] {
  mut previous = ""
  loop {
    if ($outFile | path exists) {
      let current = (open $outFile --raw | hash sha256)
      if $current != $previous {
        mkdir $targetDir
        cp $outFile ($targetDir | path join $targetName)
        print -e $"[hoyofall] injected fragment -> ($targetDir)/($targetName)"
        if ($reload | length) > 0 {
          try {
            run-external $reload.0 ...($reload | skip 1)
            print -e "[hoyofall] ran the sing-box reload hook"
          } catch {|error| print -e $"[hoyofall] reload hook failed: ($error.msg)" }
        }
        $previous = $current
      }
    }
    sleep ($interval | into duration --unit sec)
  }
}

def read-dotenv [path: path] {
  if not ($path | path exists) {
    return []
  }
  open $path --raw
  | lines
  | each {|line| $line | str trim }
  | where {|line| ($line != "") and (not ($line | str starts-with "#")) }
  | parse "{key}={value}"
  | each {|pair| { key: $pair.key, value: $pair.value } }
}

# When hoyofall writes a new fragment, restart a service so it reloads it.
# Optional (see `restart_singbox_on_change`); the supervisor brings the service
# back. `previous` is seeded from the current fragment so a restart is not
# triggered just because the file exists at boot.
def restart-loop [outFile: path, name: string, interval: int] {
  mut previous = (if ($outFile | path exists) { open $outFile --raw | hash sha256 } else { "" })
  loop {
    if ($outFile | path exists) {
      let current = (open $outFile --raw | hash sha256)
      if $current != $previous {
        print -e $"[hoyofall] fragment changed; restarting ($name)"
        stop-service $name
        $previous = $current
      }
    }
    sleep ($interval | into duration --unit sec)
  }
}

# Supervise one service: restart it on exit, and honour its "stopped" flag.
def supervise [name: string, delay: int] {
  let spec = (service-spec $name)
  print -e $"[hoyofall] supervising ($name) -> ($spec.log)"
  if not ($spec.bin | path exists) {
    print -e $"[hoyofall] skipping ($name): ($spec.bin) missing"
    return
  }
  loop {
    if ($spec.flag | path exists) {
      sleep 2sec
      continue
    }
    # Nushell raises on a non-zero external exit; catch it so the supervisor is
    # not taken down with the service.
    try {
      ^$spec.bin ...$spec.args o+e>| save --append $spec.log
    } catch {|error| print -e $"[hoyofall] ($name) error: ($error.msg)" }
    let code = ($env.LAST_EXIT_CODE? | default 0)
    print -e $"[hoyofall] ($name) exited ($code); restarting in ($delay)s"
    sleep ($delay | into duration --unit sec)
  }
}

def main [] {
  let config = ($DATA | path join "config.yaml")
  let envPath = ($DATA | path join "hoyofall.env")
  let confPath = ($DATA | path join "android.conf")
  let index = ($MODULE | path join "index.js")
  let node = ($MODULE | path join "bin" "node")

  if not ($node | path exists) {
    error make { msg: $"($node) is missing; reinstall the module" }
  }
  if not ($index | path exists) {
    error make { msg: $"($index) is missing; reinstall the module" }
  }

  [ "out" "log" "singbox" ] | each {|dir| mkdir ($DATA | path join $dir) }
  if not ($config | path exists) {
    cp ($MODULE | path join "config" "config.android.yaml") $config
    print -e $"[hoyofall] seeded default config at ($config)"
  }

  # Subscription tokens live in the dotenv file, never in config.yaml.
  let dotenv = (read-dotenv $envPath)
  load-env ($dotenv | reduce --fold {} {|pair, acc| $acc | insert $pair.key $pair.value })

  let conf = (if ($confPath | path exists) { open $confPath --raw | from toml } else { {} })
  let outFile = ($conf | get --optional out_file | default ($DATA | path join "out" "fragment.json"))
  let watch = ($conf | get --optional watch_singbox | default true)
  let targetDir = ($conf | get --optional singbox_dir | default "")
  let targetName = ($conf | get --optional singbox_target | default "hoyofall.json")
  let reload = ($conf | get --optional singbox_reload | default [])
  let interval = ($conf | get --optional watch_interval_seconds | default 5)
  let delay = ($conf | get --optional restart_delay_seconds | default 5)
  let restartSingbox = ($conf | get --optional restart_singbox_on_change | default true)

  # Native dependencies (libc++_shared.so) are staged next to the binaries.
  let libDir = ($MODULE | path join "lib")
  if ($libDir | path exists) {
    let existing = ($env.LD_LIBRARY_PATH? | default "")
    $env.LD_LIBRARY_PATH = (if $existing == "" { $libDir } else { $"($libDir):($existing)" })
  }

  # Prebuilt payloads bundle a CA store; point Node/OpenSSL at it.
  let cert = ($MODULE | path join "etc" "ssl" "cert.pem")
  if ($cert | path exists) {
    $env.SSL_CERT_FILE = $cert
    $env.NODE_EXTRA_CA_CERTS = $cert
  }
  # Also trust the platform store so extra roots installed there are honoured.
  let certDir = "/system/etc/security/cacerts"
  if ($certDir | path exists) {
    $env.SSL_CERT_DIR = $certDir
  }

  if $watch and ($targetDir != "") {
    try {
      job spawn { watch-loop $outFile $targetDir $targetName $reload $interval }
      print -e $"[hoyofall] watching ($outFile) -> ($targetDir)"
    } catch {|error| print -e $"[hoyofall] fragment watcher not started: ($error.msg)" }
  }

  # Restart the bundled sing-box when hoyofall writes a new fragment (it reads
  # its config once). Optional: `restart_singbox_on_change` in android.conf.
  let singboxBin = ($MODULE | path join "bin" "sing-box")
  if $restartSingbox and ($singboxBin | path exists) {
    try {
      job spawn { restart-loop $outFile "sing-box" $interval }
      print -e $"[hoyofall] will restart sing-box on fragment change"
    } catch {|error| print -e $"[hoyofall] sing-box restarter not started: ($error.msg)" }
  }

  service-names | each {|name|
    job spawn { supervise $name $delay }
  }
  print -e $"[hoyofall] supervisors started; output ($outFile)"

  # Keep the process (and its job threads) alive.
  loop { sleep 3600sec }
}

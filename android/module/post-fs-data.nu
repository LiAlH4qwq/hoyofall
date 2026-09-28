#!/usr/bin/env nu
# hoyofall Android module: early boot preparation.
#
# Runs from post-fs-data.sh (the shim `exec`s this file). Creates the state
# directory and seeds the default configuration on first boot. Keep this fast
# and side-effect-light: it runs synchronously during boot. All logic is
# Nushell; the .sh shim is an unavoidable module-API entrypoint.

use ./services.nu *

def seed [from: path, to: path, label: string] {
  if not ($to | path exists) {
    cp $from $to
    print -e $"[hoyofall] seeded ($label) at ($to)"
  }
}

def main [] {
  [ "out" "log" "singbox" ] | each {|dir| mkdir ($DATA | path join $dir) }

  seed ($MODULE | path join "config" "config.android.yaml") ($DATA | path join "config.yaml") "config"
  seed ($MODULE | path join "config" "hoyofall.env.example") ($DATA | path join "hoyofall.env") "token env"
  seed ($MODULE | path join "config" "android.conf.example") ($DATA | path join "android.conf") "module settings"
  seed ($MODULE | path join "config" "singbox.json") ($DATA | path join "singbox" "config.json") "sing-box config"

  ^chmod 700 $DATA
  print -e $"[hoyofall] post-fs-data: prepared ($DATA)"
}

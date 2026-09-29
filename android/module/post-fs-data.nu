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
  # The global data dir holds the supervisor config; each app owns a subdir.
  [
    $HOYOFALL_DIR
    ($HOYOFALL_DIR | path join "out")
    ($HOYOFALL_DIR | path join "log")
    $SINGBOX_DIR
    ($SINGBOX_DIR | path join "cache")
    ($SINGBOX_DIR | path join "log")
  ] | each {|dir| mkdir $dir }

  seed ($MODULE | path join "config" "config.android.yaml") ($HOYOFALL_DIR | path join "config.yaml") "config"
  seed ($MODULE | path join "config" "hoyofall.env.example") ($HOYOFALL_DIR | path join "hoyofall.env") "token env"
  seed ($MODULE | path join "config" "android.conf.example") ($DATA | path join "android.conf") "module settings"
  seed ($MODULE | path join "config" "singbox.json") ($SINGBOX_DIR | path join "config.json") "sing-box config"

  ^chmod 700 $DATA
  print -e $"[hoyofall] post-fs-data: prepared ($DATA)"
}

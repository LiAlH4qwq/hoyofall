#!/usr/bin/env nu
# hoyofall Android module: uninstall cleanup.
#
# Runs from uninstall.sh (the shim `exec`s this file). Stops the daemon and the
# supervisor. User state under /data/adb/hoyofall is intentionally kept (it holds
# config and tokens); remove it by hand if you want a clean slate.

const MODULE = "/data/adb/modules/hoyofall"
const DATA = "/data/adb/hoyofall"

def main [] {
  let index = ($MODULE | path join "index.js")
  let service = ($MODULE | path join "service.nu")
  let targets = [$index, $service]
  $targets | each {|target|
    let pids = (try { ^pgrep -f $target | lines | each {|line| $line | into int } } catch { [] })
    $pids | each {|pid|
      print -e $"[hoyofall] stopping pid ($pid)"
      try { ^kill $pid } catch { print -e $"[hoyofall] could not stop ($pid)" }
    }
  }
  print -e $"[hoyofall] uninstalled; configuration left at ($DATA)"
}

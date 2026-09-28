#!/usr/bin/env nu
# hoyofall Android module: uninstall cleanup.
#
# Runs from uninstall.sh (the shim `exec`s this file). Stops every supervised
# service and the supervisor. User state under /data/adb/hoyofall is
# intentionally kept (it holds config and tokens); remove it by hand if you want
# a clean slate.

use ./services.nu *

def main [] {
  for name in (service-names) {
    try { stop-service $name } catch {|error| print -e $"[hoyofall] ($name): ($error.msg)" }
  }
  pids "service.nu" | each {|pid|
    print -e $"[hoyofall] stopping supervisor ($pid)"
    try { kill $pid } catch { print -e $"[hoyofall] could not stop ($pid)" }
  }
  print -e $"[hoyofall] uninstalled; configuration left at ($DATA)"
}

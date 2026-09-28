#!/usr/bin/env nu
# hoyofall Android module: status and restart action.
#
# Runs from action.sh (the shim `exec`s this file). The Magisk action button and
# `su -c 'sh /data/adb/modules/hoyofall/action.sh'` both land here. The default
# action restarts the daemon; the supervisor in service.nu brings it back.

const MODULE = "/data/adb/modules/hoyofall"
const DATA = "/data/adb/hoyofall"

def node-pids [index: path] {
  try {
    ^pgrep -f $index | lines | each {|line| $line | into int }
  } catch {
    []
  }
}

def show-status [] {
  let outFile = ($DATA | path join "out" "fragment.json")
  let log = ($DATA | path join "log" "hoyofall.log")
  print "hoyofall (Android module)"
  print $"  config:  ($DATA)/config.yaml"
  print $"  output:  ($outFile)"
  if ($outFile | path exists) {
    let info = (ls $outFile | select size modified | first)
    print $"  fragment: ($info.size) bytes, modified ($info.modified)"
  } else {
    print "  fragment: not written yet"
  }
  print "  --- log tail ---"
  if ($log | path exists) {
    print (open $log | lines | last 20 | str join "\n")
  } else {
    print "  (no log yet)"
  }
}

def main [
  --status   # only print status; default also asks the daemon to restart
] {
  let index = ($MODULE | path join "index.js")
  if not $status {
    let pids = (node-pids $index)
    if ($pids | length) == 0 {
      print -e "[hoyofall] daemon not running; nothing to restart"
    } else {
      $pids | each {|pid|
        print -e $"[hoyofall] stopping daemon pid ($pid)"
        try { ^kill $pid } catch {|error| print -e $"[hoyofall] could not stop ($pid): ($error.msg)" }
      }
    }
  }
  show-status
}

#!/system/bin/sh
# Magisk applies default module permissions (files 0644) after extraction, which
# clears the exec bit on the bundled payload. Restore it here; this runs before
# any shim needs `nu`, and needs no exec bit itself (the module API runs it with
# the system shell). This is the only shim allowed to contain logic, and it must
# stay a single chmod.
chmod 0755 "$MODPATH"/bin/* "$MODPATH"/*.sh

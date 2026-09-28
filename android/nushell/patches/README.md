# Vendored Termux Nushell patches

Copied verbatim from
[`termux/termux-packages`](https://github.com/termux/termux-packages)
`packages/nushell/` at commit `4deaf1ad3b44146ec6c8a6dd32da0c09b00d387c`
(pinned in `../versions.lock`).

- `0001-remove-sysinfo-Users.patch` — removes the `sysinfo` `Users` listing,
  which is unsupported on Android. **Required.**

Termux also carries an OSC 52 clipboard patch. It is intentionally not vendored:
the minimal build disables `system-clipboard`, so the clipboard code path is
never compiled.

`build.nu` applies every `*.patch` here in sorted order with `patch -p1`.
Bumping Nushell means re-vendoring the matching Termux revision.

Termux's license places package patches under the license of the package they
build, so this patch is MIT (Nushell). See
[`THIRD_PARTY_LICENSES.md`](../../../THIRD_PARTY_LICENSES.md).

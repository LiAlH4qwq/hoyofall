# Vendored Termux Node patches

These patches are copied verbatim from
[`termux/termux-packages`](https://github.com/termux/termux-packages)
`packages/nodejs/` at commit `4deaf1ad3b44146ec6c8a6dd32da0c09b00d387c`
(pinned in `../versions.lock`). Termux is the maintained Android build of Node;
these carry the Android/bionic fixes that upstream does not.

They are committed here rather than downloaded so the build is reproducible and
offline-capable. `build.nu` applies them in sorted filename order with
`patch -p1`; they are tuned to the Node version pinned in `versions.lock`, so
bumping Node means re-vendoring this set from the matching Termux revision.

Termux's license places package patches under the license of the package they
build, so these patches are MIT (Node.js). See
[`THIRD_PARTY_LICENSES.md`](../../../THIRD_PARTY_LICENSES.md).

Files that only touch `test-*` were intentionally not vendored: they do not
affect the shipped binary.

# Third-party licenses and notices

hoyofall's own source code is licensed under the MIT License (see
[`LICENSE`](./LICENSE)). That license covers only the original hoyofall code.

The repository also **vendors** third-party patches and, when built, the Android
module **redistributes prebuilt third-party binaries** inside
`hoyofall-android-<arch>.zip` (and the Nix `hoyofall-android` output). Those
components remain under their own licenses, listed below. Full license texts are
in [`licenses/`](./licenses/).

Redistribution of the flashable Android module is therefore an aggregate of
MIT-licensed hoyofall code and the third-party components below; it is **not**
relicensed under MIT. In particular, the bundled **sing-box** is
**GPL-3.0-or-later**, a strong copyleft license.

## Bundled at runtime (Android module / Nix android output)

| Component | File(s) | License | Upstream |
|---|---|---|---|
| sing-box | `bin/sing-box` | GPL-3.0-or-later | <https://github.com/SagerNet/sing-box> (v1.14.2) |
| Node.js | `bin/node`, `lib/*` | MIT | <https://github.com/nodejs/node> (26.4.0, Termux build) |
| Nushell | `bin/nu`, `lib/*` | MIT | <https://github.com/nushell/nushell> (0.116.0, Termux build) |
| libc++ | `lib/libc++_shared.so` | Apache-2.0 WITH LLVM-exception | <https://libcxx.llvm.org/> |
| OpenSSL | `lib/libcrypto.so.3`, `lib/libssl.so.3` | Apache-2.0 | <https://www.openssl.org/> |
| c-ares | `lib/libcares.so` | MIT | <https://c-ares.org/> |
| ICU | `lib/libicudata.so.78`, `lib/libicui18n.so.78`, `lib/libicuuc.so.78` | Unicode-3.0 | <https://icu.unicode.org/> |
| SQLite | `lib/libsqlite3.so` | Public domain | <https://www.sqlite.org/> |
| zlib | `lib/libz.so.1` | Zlib | <https://www.zlib.net/> |
| libffi | `lib/libffi.so` | MIT | <https://sourceware.org/libffi/> |
| CA certificates | `etc/ssl/cert.pem` | MPL-2.0 (Debian `ca-certificates`) | <https://salsa.debian.org/debian/ca-certificates> |
| KernelSU WebUI bundle | `webroot/app.js` | MIT | React, react-dom, Effect, CodeMirror, `@uiw/react-codemirror` |

The Termux-built Node.js and Nushell binaries are taken from the Termux
aarch64 packages pinned in `nix/android.nix`. The Nix package
`packages.<system>.hoyofall` bundles only hoyofall (MIT) and the MIT-licensed
WebUI dependencies.

## Vendored patches

`android/node/patches/termux/**` and `android/nushell/patches/termux/**` are
copied verbatim from [`termux/termux-packages`](https://github.com/termux/termux-packages)
at the commit recorded in each `android/*/versions.lock`. Per
[Termux's license](https://github.com/termux/termux-packages/blob/master/LICENSE.md),
**package patches are licensed under the same license as the package they
build**: the Node patches under Node.js's MIT license, and the Nushell patch
under Nushell's MIT license. They are therefore compatible with this
repository's MIT license. Provenance and commit pins are recorded in the
matching `patches/README.md` and `versions.lock`.

## GNU GPL-3.0-or-later — sing-box

The Android module redistributes an **unmodified** prebuilt sing-box binary:

```
sing-box: Copyright (C) 2022 by nekohasekai <contact-sagernet@sekai.icu>

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.

In addition, no derivative work may use the name or imply association
with this application without prior consent.
```

The full license text ships as
[`licenses/GPL-3.0-or-later.txt`](./licenses/GPL-3.0-or-later.txt) and is
included in the flashable module.

**Written offer / corresponding source.** hoyofall does not modify sing-box.
The corresponding source of the bundled version is published upstream at the
tag matching `android/singbox/versions.lock`:
<https://github.com/SagerNet/sing-box/tree/v1.14.2>. The exact pinned tarball
and its SHA-256 are recorded in that file.

## Other license texts

| License | Text |
|---|---|
| Apache-2.0 | [`licenses/Apache-2.0.txt`](./licenses/Apache-2.0.txt) |
| Apache-2.0 WITH LLVM-exception (libc++) | [`licenses/libcxx-Apache-2.0-LLVM-exception.txt`](./licenses/libcxx-Apache-2.0-LLVM-exception.txt) |
| MIT | [`licenses/MIT.txt`](./licenses/MIT.txt) |
| MIT (c-ares, with its historical copyright) | [`licenses/c-ares-MIT.txt`](./licenses/c-ares-MIT.txt) |
| MPL-2.0 | [`licenses/MPL-2.0.txt`](./licenses/MPL-2.0.txt) |
| Unicode-3.0 (ICU) | [`licenses/Unicode-3.0.txt`](./licenses/Unicode-3.0.txt) |
| Zlib | [`licenses/Zlib.txt`](./licenses/Zlib.txt) |

### MIT components — copyright notices

- **Node.js** — Copyright Node.js contributors. All rights reserved.
- **Nushell** — Copyright (c) 2019 Nushell contributors.
- **c-ares** — Copyright (c) 1998 Massachusetts Institute of Technology;
  Copyright (c) 2007-2024 Daniel Stenberg.
- **libffi** — Copyright (c) 1996-2014 Anthony Green, Red Hat, Inc and others.
- **React / react-dom** — Copyright (c) Meta Platforms, Inc. and affiliates.
- **CodeMirror / @uiw/react-codemirror** — Copyright (C) by Marijn Haverbeke
  and others; Copyright (c) 2021-present uiw.
- **Effect** — Copyright (c) 2022 Michael Arnaldi and the Effect contributors.

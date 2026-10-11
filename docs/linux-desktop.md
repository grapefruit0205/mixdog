# Linux desktop installation

The Electron desktop and its native Linux backend can be built locally. The
upstream download page currently supplies Windows and macOS installers.

On Linux x64, install Node.js 22.19+ (or 24+) and a Rust toolchain supporting
Rust 1.87+, then run from the repository root:

```sh
npm ci
npm ci --prefix apps/desktop
npm run build:linux --prefix apps/desktop
npm run install:linux --prefix apps/desktop
```

The installer uses the `dist/linux-unpacked` folder produced alongside the
AppImage. It installs under `~/.local/opt/mixdog-desktop`, creates a
`~/.local/bin/mixdog-desktop` launcher, and registers the application icon,
desktop entry and `mixdog:` URL handler. Root and FUSE are not required.
Chromium's sandbox remains enabled.

Runtime preparation also verifies the Linux PTY addon with the packaged
Electron version. The upstream Node-API binaries are compatible, but need an
Electron ABI filename for node-pty's loader to find them.

This build was verified on Ubuntu 24.04 x64 under Wayland with Electron
41.10.6. Checks covered the packaged application, file read/save through the
desktop bridge, interactive Bash output, and the embedding/PostgreSQL memory
runtime. Provider sign-in and live model requests require the user's account
and were not exercised by the installation checks.

Launch **Mixdog** from the desktop application menu and connect a model in
Settings. To update this local build, pull the source, rebuild and rerun the
installer. Previous builds are retained beside the `current` symlink.

The app is a local Linux build. Windows-specific Office COM automation and
Windows browser password import are not available. Computer Use capabilities
depend on the desktop session and its permissions, especially under Wayland.

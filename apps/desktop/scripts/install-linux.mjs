#!/usr/bin/env node
// Install the packaged Linux app for this user, without root or FUSE.
import { cp, mkdir, readFile, rename, stat, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'linux') throw new Error('This installer requires Linux.');
const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] || join(desktopDir, 'dist', 'linux-unpacked'));
const executable = join(source, 'mixdog-desktop');
const info = await stat(executable);
if (!info.isFile() || !(info.mode & 0o111)) throw new Error(`Not an executable: ${executable}`);
await stat(join(source, 'resources', 'app.asar'));
await stat(join(source, 'resources', 'runtime.asar'));
const { version } = JSON.parse(await readFile(join(desktopDir, 'package.json'), 'utf8'));

const dataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
const binDir = join(homedir(), '.local', 'bin');
const installRoot = join(homedir(), '.local', 'opt', 'mixdog-desktop');
const build = join(installRoot, `${version}-${Date.now()}`);
const icon = join(dataHome, 'icons', 'hicolor', '256x256', 'apps', 'mixdog-desktop.png');
const entry = join(dataHome, 'applications', 'mixdog-desktop.desktop');
const launcher = join(binDir, 'mixdog-desktop');
await Promise.all([
  mkdir(installRoot, { recursive: true }),
  mkdir(binDir, { recursive: true }),
  mkdir(dirname(icon), { recursive: true }),
  mkdir(dirname(entry), { recursive: true }),
]);
await cp(source, build, { recursive: true, preserveTimestamps: true });
// Swap the active build atomically; previous builds remain available to recover.
const next = join(installRoot, `.current-${process.pid}`);
await symlink(build, next);
await rename(next, join(installRoot, 'current'));
await cp(join(source, 'resources', 'mixdog.png'), icon);

const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const desktopQuote = (value) => `"${value.replace(/[\\"`$]/g, '\\$&')}"`;
const launcherNext = `${launcher}.install-${process.pid}`;
await writeFile(launcherNext, `#!/bin/sh\nunset ELECTRON_RUN_AS_NODE\nexec ${shellQuote(join(installRoot, 'current', 'mixdog-desktop'))} "$@"\n`, { mode: 0o755 });
await rename(launcherNext, launcher);
await writeFile(entry, [
  '[Desktop Entry]',
  'Type=Application',
  'Name=Mixdog',
  'Comment=AI coding workspace',
  `Exec=${desktopQuote(launcher)} %U`,
  `TryExec=${launcher}`,
  `Icon=${icon}`,
  'Terminal=false',
  'Categories=Development;IDE;',
  'StartupWMClass=mixdog-desktop',
  'MimeType=x-scheme-handler/mixdog;',
  '',
].join('\n'));
for (const [command, args] of [
  ['update-desktop-database', [dirname(entry)]],
  ['gtk-update-icon-cache', ['-f', '-t', join(dataHome, 'icons', 'hicolor')]],
  ['xdg-mime', ['default', 'mixdog-desktop.desktop', 'x-scheme-handler/mixdog']],
]) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error?.code !== 'ENOENT' && (result.error || result.status !== 0)) {
    console.warn(`${command}: ${result.error?.message || result.stderr?.trim() || 'integration refresh failed'}`);
  }
}
console.log(`Installed Mixdog ${version}: ${build}`);
console.log(`Launch from the app menu, or run ${launcher}`);

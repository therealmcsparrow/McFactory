// Builds ../server.js into one executable (Node single executable application) and puts it where
// Tauri expects the sidecar: src-tauri/binaries/server-<target triple>[.exe].
// Uses the node that runs this script, so the sidecar has that Node version built in.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const binDir = path.resolve(here, '..', 'src-tauri', 'binaries');
const triple = /host: (\S+)/.exec(execFileSync('rustc', ['-vV'], { encoding: 'utf8' }))?.[1];
if (!triple) throw new Error('cannot read the target triple from rustc -vV');
const out = path.join(binDir, `server-${triple}${process.platform === 'win32' ? '.exe' : ''}`);

fs.mkdirSync(binDir, { recursive: true });
const cfg = path.join(binDir, 'sea-config.json');
fs.writeFileSync(cfg, JSON.stringify({
  main: path.join(repo, 'server.js'),
  output: out,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
}, null, 2));
execFileSync(process.execPath, ['--build-sea', cfg], { stdio: 'inherit' });
fs.rmSync(cfg);
console.log('sidecar: ' + path.relative(process.cwd(), out));

// Packs dist/ into dist/bundle.zip for over-the-air updates of the native app.
// The server serves it next to dist/version.json (written by vite.config.ts).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { zipSync } from 'fflate';

const dist = path.resolve(import.meta.dirname, '../dist');
const skip = new Set(['bundle.zip']);
const files = {};

(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(dist, full).split(path.sep).join('/');
    if (skip.has(rel)) continue;
    if (fs.statSync(full).isDirectory()) walk(full);
    else files[rel] = fs.readFileSync(full);
  }
})(dist);

const zip = zipSync(files, { level: 9 });
fs.writeFileSync(path.join(dist, 'bundle.zip'), zip);

// The updater plugin refuses downloads without the zip's SHA-256 (lowercase hex).
const versionFile = path.join(dist, 'version.json');
const { version } = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
const checksum = crypto.createHash('sha256').update(zip).digest('hex');
fs.writeFileSync(versionFile, JSON.stringify({ version, checksum }));
console.log(`bundle.zip: ${Object.keys(files).length} files, version ${version}, sha256 ${checksum.slice(0, 12)}…`);

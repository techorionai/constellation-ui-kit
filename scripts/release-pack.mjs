#!/usr/bin/env node
// Pack the package for a release.
// Usage: node scripts/release-pack.mjs <tag> <out-dir>
// The tag must be vX.Y.Z or vX.Y.Z-rc.N. Any other tag stops the script with exit code 1
// before it changes a file. The script restores package.json and package-lock.json at the end.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG_PATTERN = /^v(\d+\.\d+\.\d+(?:-rc\.\d+)?)$/;

/** Return the version for a release tag, or null if the tag is not valid. */
export function versionFromTag(tag) {
  const match = TAG_PATTERN.exec(tag ?? '');
  return match ? match[1] : null;
}

/** True if the tag has the form vX.Y.Z or vX.Y.Z-rc.N. */
export function checkTag(tag) {
  return versionFromTag(tag) !== null;
}

function npm(args, options = {}) {
  const execPath = process.env.npm_execpath;
  const result = execPath
    ? spawnSync(process.execPath, [execPath, ...args], { encoding: 'utf8', ...options })
    : spawnSync('npm', args, {
        encoding: 'utf8',
        shell: process.platform === 'win32',
        ...options,
      });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    throw new Error(`npm ${args[0]} failed`);
  }
  return result.stdout;
}

function main() {
  const [tag, outArg] = process.argv.slice(2);
  const version = versionFromTag(tag);
  if (!version || !outArg) {
    console.error('Usage: node scripts/release-pack.mjs <vX.Y.Z or vX.Y.Z-rc.N> <out-dir>');
    process.exit(1);
  }
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const outDir = resolve(outArg);
  const files = ['package.json', 'package-lock.json'].map((name) => join(root, name));
  const backup = files.map((file) => (existsSync(file) ? readFileSync(file) : null));
  mkdirSync(outDir, { recursive: true });
  const before = new Set(readdirSync(outDir));
  try {
    npm(['version', '--no-git-tag-version', '--allow-same-version', version], { cwd: root });
    npm(['pack', '--pack-destination', outDir], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  } finally {
    files.forEach((file, index) => {
      const content = backup[index];
      if (content) writeFileSync(file, content);
    });
  }
  const tarballs = readdirSync(outDir).filter((name) => name.endsWith('.tgz') && !before.has(name));
  if (tarballs.length !== 1) {
    console.error('Expected one new tarball in the output folder.');
    process.exit(1);
  }
  const tarball = tarballs[0];
  const hash = createHash('sha256')
    .update(readFileSync(join(outDir, tarball)))
    .digest('hex');
  writeFileSync(join(outDir, `${tarball}.sha256`), `${hash}  ${basename(tarball)}\n`);
  console.log(`${tarball}\n${hash}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

#!/usr/bin/env node
// Integration runner. See docs/development.md.
// 1. Pack the kit and check the tarball (I1).
// 2. Install the tarball in testdata/consumer-app and build the app (I2).
// 3. Run the release pack tests (I7).
// 4. Serve the app with the CSP and run Playwright (I3 to I6, I8, I9).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const app = join(root, 'testdata', 'consumer-app');
const npmCli = process.env.npm_execpath;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'inherit', ...options });
  if (result.status !== 0) fail(`${command} ${args.join(' ')} exited with ${result.status}`);
}

function runNpm(args, options = {}) {
  if (npmCli) return run(process.execPath, [npmCli, ...args], options);
  return run('npm', args, { shell: process.platform === 'win32', ...options });
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) fail(`${command} ${args.join(' ')} exited with ${result.status}`);
  return result.stdout;
}

function nodeBin(packageDir, relative, args, options = {}) {
  run(process.execPath, [join(packageDir, 'node_modules', relative), ...args], options);
}

async function waitForServer(url, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is not ready.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  fail(`The server at ${url} did not start`);
}

const work = mkdtempSync(join(tmpdir(), 'ui-kit-integration-'));
let server;

try {
  // I1: pack the kit. The prepack script builds dist/.
  console.log('== I1: pack the kit');
  const packDir = join(work, 'pack');
  mkdirSync(packDir, { recursive: true });
  runNpm(['pack', '--pack-destination', packDir], { cwd: root });
  const tarball = join(packDir, readdirSync(packDir).find((name) => name.endsWith('.tgz')) ?? '');
  const listing = capture('tar', ['-tzf', basename(tarball)], { cwd: packDir })
    .split(/\r?\n/)
    .filter(Boolean);
  for (const file of [
    'package/dist/index.js',
    'package/dist/index.d.ts',
    'package/dist/styles.css',
    'package/dist/color-scheme.js',
    'package/dist/vite.js',
    'package/dist/vite.d.ts',
  ]) {
    if (!listing.includes(file)) fail(`The tarball has no ${file}`);
  }
  const indexJs = capture('tar', ['-xzOf', basename(tarball), 'package/dist/index.js'], {
    cwd: packDir,
  });
  if (/from\s+['"]https?:/.test(indexJs) || /import\s*\(\s*['"]https?:/.test(indexJs)) {
    fail('dist/index.js imports a URL');
  }
  if (
    !/from\s*["']react\/jsx-runtime["']/.test(indexJs) ||
    !/from\s*["']@mantine\/core["']/.test(indexJs)
  ) {
    fail('dist/index.js does not import React and Mantine as external packages');
  }
  if (/__SECRET_INTERNALS_DO_NOT_USE/.test(indexJs)) fail('dist/index.js has a copy of React');
  if (indexJs.length > 200_000) fail('dist/index.js is too large. It can have a copy of a peer.');

  // I2: install the tarball in the consumer app and build.
  console.log('== I2: install the tarball and build the consumer app');
  const statusBefore = capture(
    'git',
    ['status', '--porcelain', '--untracked-files=all', 'testdata/'],
    {
      cwd: root,
    },
  );
  runNpm(['ci'], { cwd: app });
  runNpm(['install', '--no-save', tarball], { cwd: app });
  nodeBin(app, 'typescript/bin/tsc', ['--noEmit'], { cwd: app });
  nodeBin(app, 'vite/bin/vite.js', ['build'], { cwd: app });
  const statusAfter = capture(
    'git',
    ['status', '--porcelain', '--untracked-files=all', 'testdata/'],
    {
      cwd: root,
    },
  );
  if (statusAfter !== statusBefore) fail(`The run changed files in testdata/: ${statusAfter}`);

  // I7: release pack tests.
  console.log('== I7: release pack script');
  const goodDir = join(work, 'release-good');
  const badDir = join(work, 'release-bad');
  const packageBefore = readFileSync(join(root, 'package.json'), 'utf8');
  const lockBefore = readFileSync(join(root, 'package-lock.json'), 'utf8');
  const script = join(root, 'scripts', 'release-pack.mjs');
  run(process.execPath, [script, 'v0.0.1-rc.1', goodDir], {
    cwd: root,
    env: { ...process.env, npm_execpath: npmCli ?? '' },
  });
  const goodFiles = readdirSync(goodDir);
  const tgz = goodFiles.find((name) => name.endsWith('.tgz'));
  const sha = goodFiles.find((name) => name.endsWith('.sha256'));
  if (!tgz || !sha) fail('release-pack made no tarball or no .sha256 file');
  const expected = readFileSync(join(goodDir, sha), 'utf8').trim().split(/\s+/)[0];
  const actual = createHash('sha256')
    .update(readFileSync(join(goodDir, tgz)))
    .digest('hex');
  if (expected !== actual) fail('The .sha256 file does not match the tarball');
  const packed = JSON.parse(
    capture('tar', ['-xzOf', tgz, 'package/package.json'], { cwd: goodDir }),
  );
  if (packed.version !== '0.0.1-rc.1') fail(`Packed version is ${packed.version}`);
  const bad = spawnSync(process.execPath, [script, '1.0', badDir], { encoding: 'utf8' });
  if (bad.status !== 1) fail('release-pack must exit with code 1 for the tag 1.0');
  let badFiles = [];
  try {
    badFiles = readdirSync(badDir);
  } catch {
    // The folder does not exist. This is correct.
  }
  if (badFiles.length > 0) fail('release-pack made a file for a bad tag');
  if (readFileSync(join(root, 'package.json'), 'utf8') !== packageBefore) {
    fail('package.json changed');
  }
  if (readFileSync(join(root, 'package-lock.json'), 'utf8') !== lockBefore) {
    fail('package-lock.json changed');
  }

  // I3 to I6, I8, I9: serve the app and run Playwright.
  console.log('== I3 to I6, I8, I9: browser tests');
  server = spawn(
    process.execPath,
    [
      join(app, 'node_modules', 'vite', 'bin', 'vite.js'),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      '4173',
      '--strictPort',
    ],
    { cwd: app, stdio: 'inherit' },
  );
  await waitForServer('http://127.0.0.1:4173/');
  nodeBin(root, '@playwright/test/cli.js', ['test'], { cwd: root });
} catch (error) {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
} finally {
  if (server) server.kill();
  rmSync(work, { recursive: true, force: true });
}

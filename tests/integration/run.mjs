#!/usr/bin/env node
// Integration runner. See docs/development.md.
// 1. Pack the kit and check the tarball (I1).
// 2. Install the tarball in testdata/consumer-app and build the app (I2).
// 3. Run the release pack tests (I7).
// 4. Serve the app with the CSP and run Playwright (I3 to I6, I8, I9).
// 5. Start PostgreSQL, Valkey, and identity with testcontainers. Run the login tests
//    (login I1 to I9, I11, I12, and I13 of the login plan). Then run the MFA test (login I10)
//    with a second set of containers. login I14 is in step 1.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { CLIENT_ID, startIdentityStack } from './identity.mjs';

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

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
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

const ADMIN = {
  email: 'admin@example.com',
  name: 'Ada Admin',
  password: 'correct horse battery staple',
};

/** Build the consumer app for one issuer and serve it with vite preview. */
async function serveApp(issuer, name) {
  const outDir = join(work, name);
  const env = { ...process.env, VITE_ISSUER: issuer, VITE_CLIENT_ID: CLIENT_ID };
  nodeBin(app, 'vite/bin/vite.js', ['build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: app,
    env,
  });
  const appPort = await freePort();
  const child = spawn(
    process.execPath,
    [
      join(app, 'node_modules', 'vite', 'bin', 'vite.js'),
      'preview',
      '--outDir',
      outDir,
      '--bypass-lock',
      '--host',
      '127.0.0.1',
      '--port',
      String(appPort),
      '--strictPort',
    ],
    { cwd: app, stdio: 'inherit', env },
  );
  servers.push(child);
  await waitForServer(`http://127.0.0.1:${appPort}/`);
  return appPort;
}

/** Complete the setup page of identity in a real browser. */
async function completeSetup(setupLink, afterSubmit) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(setupLink);
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Name').fill(ADMIN.name);
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
    await page.getByLabel('Password again').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Make account' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/setup'));
    if (afterSubmit) await afterSubmit(page);
  } finally {
    await browser.close();
  }
}

/** Login I13: the metadata of the kit is equal to the discovery document of identity. */
async function checkDiscovery(issuer) {
  const { serverMetadata } = await import(
    pathToFileURL(join(root, 'src', 'auth', 'metadata.ts')).href
  );
  const discovery = await (await fetch(`${issuer}/.well-known/openid-configuration`)).json();
  const kit = serverMetadata(issuer);
  for (const key of Object.keys(kit)) {
    if (discovery[key] !== kit[key]) {
      fail(`I13: ${key} is ${discovery[key]} at identity and ${kit[key]} in the kit`);
    }
  }
}

function playwright(spec, env) {
  nodeBin(root, '@playwright/test/cli.js', ['test', spec], {
    cwd: root,
    env: { ...process.env, ...env },
  });
}

async function runLoginTests() {
  console.log('== login I1 to I9, I11 to I13: identity in containers');
  const main = await startIdentityStack({ requireMfaForAdmins: false });
  stacks.push(main);
  await completeSetup(await main.setupLink());
  await checkDiscovery(main.issuer);
  const mainPort = await serveApp(main.issuer, 'app-main');
  playwright('login.spec', {
    UI_KIT_TEST_PORT: String(mainPort),
    UI_KIT_ISSUER: main.issuer,
    UI_KIT_USER_EMAIL: ADMIN.email,
    UI_KIT_USER_PASSWORD: ADMIN.password,
  });
  await main.stop();
  stacks.splice(stacks.indexOf(main), 1);

  console.log('== login I10: identity with MFA for admins');
  const mfa = await startIdentityStack({ requireMfaForAdmins: true });
  stacks.push(mfa);
  const mfaPort = await serveApp(mfa.issuer, 'app-mfa');
  playwright('login-mfa.spec', {
    UI_KIT_TEST_PORT: String(mfaPort),
    UI_KIT_ISSUER: mfa.issuer,
    UI_KIT_SETUP_LINK: await mfa.setupLink(),
    UI_KIT_USER_EMAIL: ADMIN.email,
    UI_KIT_USER_NAME: ADMIN.name,
    UI_KIT_USER_PASSWORD: ADMIN.password,
  });
}

const work = mkdtempSync(join(tmpdir(), 'ui-kit-integration-'));
let server;
const servers = [];
const stacks = [];

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
  // Check the import specifiers of all JavaScript files of dist/. Each specifier must be
  // relative, a Node.js built-in, or a peer dependency of the kit. This catches an import
  // of a copy of React or Mantine at a path that is not the peer package.
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const peers = Object.keys(pkg.peerDependencies ?? {});
  const dependencies = Object.keys(pkg.dependencies ?? {});
  const allowedImport = (spec) =>
    spec.startsWith('./') ||
    spec.startsWith('../') ||
    spec.startsWith('node:') ||
    [...peers, ...dependencies].some((name) => spec === name || spec.startsWith(`${name}/`));
  const imported = new Set();
  for (const file of listing.filter((name) => /^package\/dist\/.*\.js$/.test(name))) {
    const code = capture('tar', ['-xzOf', basename(tarball), file], { cwd: packDir });
    for (const match of code.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g)) {
      if (!allowedImport(match[1]))
        fail(`${file} imports ${match[1]}. It is not a peer package or a dependency.`);
      imported.add(match[1]);
    }
    if (/__SECRET_INTERNALS_DO_NOT_USE/.test(code)) fail(`${file} has a copy of React`);
  }
  // Login I14: the tarball has the dependency with an exact version, and dist/ does not copy it.
  const packedPackage = JSON.parse(
    capture('tar', ['-xzOf', basename(tarball), 'package/package.json'], { cwd: packDir }),
  );
  const oauthVersion = packedPackage.dependencies?.oauth4webapi;
  if (!oauthVersion || !/^\d+\.\d+\.\d+$/.test(oauthVersion)) {
    fail(`dependencies.oauth4webapi must be an exact version. It is ${oauthVersion}`);
  }
  if (!imported.has('oauth4webapi')) fail('dist/index.js does not import oauth4webapi');
  if (/class OperationProcessingError|function generateRandomCodeVerifier\(/.test(indexJs)) {
    fail('dist/index.js has a copy of oauth4webapi');
  }
  for (const spec of ['react/jsx-runtime', '@mantine/core']) {
    if (!imported.has(spec)) fail(`dist does not import ${spec} as an external package`);
  }

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
  const port = await freePort();
  server = spawn(
    process.execPath,
    [
      join(app, 'node_modules', 'vite', 'bin', 'vite.js'),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: app, stdio: 'inherit' },
  );
  await waitForServer(`http://127.0.0.1:${port}/`);
  nodeBin(root, '@playwright/test/cli.js', ['test', 'consumer-app'], {
    cwd: root,
    env: { ...process.env, UI_KIT_TEST_PORT: String(port) },
  });
  await runLoginTests();
} catch (error) {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
} finally {
  if (server) server.kill();
  for (const child of servers) child.kill();
  for (const stack of stacks) await stack.stop();
  rmSync(work, { recursive: true, force: true });
}

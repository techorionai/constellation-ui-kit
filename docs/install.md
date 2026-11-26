# Install

## Tarball URL

Each GitHub release has two files:

- `techorionai-constellation-ui-kit-<version>.tgz`
- `techorionai-constellation-ui-kit-<version>.tgz.sha256`

Use the tarball URL as the version of the package in `package.json`:

```json
"@techorionai/constellation-ui-kit": "https://github.com/techorionai/constellation-ui-kit/releases/download/v0.1.0/techorionai-constellation-ui-kit-0.1.0.tgz"
```

A public GitHub release needs no account, no token, and no registry login.

## Lock file integrity

`npm install` writes the `integrity` hash of the tarball to `package-lock.json`. `npm ci` checks the hash. If the file at the URL changes, the install fails.

## Update to a new version

1. Change the release tag and the version in the tarball URL in `package.json`.
2. Run `npm install`. This updates the `integrity` value in the lock file.
3. Run the lint, the tests, and the build of your application.

## Peer dependencies

The kit does not include React or Mantine. Your application must have one copy of each:

| Package                  | Range     |
| ------------------------ | --------- |
| `react`, `react-dom`     | `^19.0.0` |
| `@mantine/core`          | `^9.0.0`  |
| `@mantine/hooks`         | `^9.0.0`  |
| `@mantine/notifications` | `^9.0.0`  |
| `vite` (optional)        | `>=6`     |

`vite` is a peer dependency only for the `@techorionai/constellation-ui-kit/vite` plugin.

A new Mantine major version is a new minor version of the kit before `v1.0.0`.

## Style files

Import these three files one time, in the entry file of your application:

```ts
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@techorionai/constellation-ui-kit/styles.css';
```

If you use TypeScript, add `/// <reference types="vite/client" />` to a `.d.ts` file. Then TypeScript accepts the style imports.

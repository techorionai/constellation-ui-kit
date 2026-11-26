# Development

## Commands

| Command                    | Use                                                        |
| -------------------------- | ---------------------------------------------------------- |
| `npm ci`                   | Install the dependencies.                                  |
| `npm run lint`             | `tsc --noEmit`, ESLint, and `prettier --check`.            |
| `npm test`                 | Unit tests (Vitest, jsdom, Testing Library, `vitest-axe`). |
| `npm run build`            | Vite library build to `dist/`.                             |
| `npm run test:integration` | Integration test. See below.                               |

The first run of the integration test needs a browser: `npx playwright install --with-deps chromium`.

## Integration test

`tests/integration/run.mjs` does these steps:

1. Packs the kit with `npm pack`. The `prepack` script builds `dist/`. The runner checks the file list of the tarball and checks that `dist/index.js` has no URL import and no copy of React or Mantine.
2. Installs the tarball in `testdata/consumer-app/` with `npm install --no-save`, then runs `tsc` and `vite build`. The consumer app has its own committed `package-lock.json`. It does not list the kit, so a new tarball hash does not change a committed file.
3. Runs the release pack script with a good tag and a bad tag.
4. Serves the consumer app with `vite preview`. The preview server sends the Content Security Policy of [theme.md](theme.md).
5. Runs the Playwright tests: render, color scheme at `DOMContentLoaded`, network requests, CSP violations, accessibility with `@axe-core/playwright` in both schemes (color contrast included), and the burger button.

## CI

`.github/workflows/ci.yml` calls `frontend.yml` of `constellation-ci`. The workflow runs `npm ci`, lint, unit tests, and the build. The `integration` job runs the integration command.

## Release

The `release-module` skill makes a tag `vX.Y.Z` and a GitHub release. The workflow `.github/workflows/release.yml` runs when the release is published. It has two jobs:

- `build` has read access only. It checks out the tag, runs `npm ci`, lint, tests, and `node scripts/release-pack.mjs "$TAG" out/`, and stores `out/`.
- `upload` can write to the release. It checks out no code and runs no npm command. It downloads the files and runs `gh release upload`.

`scripts/release-pack.mjs <tag> <out-dir>` accepts only `vX.Y.Z` and `vX.Y.Z-rc.N`. For other tags it exits with code 1 before it changes a file. It sets the version with `npm version --no-git-tag-version`, runs `npm pack`, writes `<tarball>.sha256`, and restores `package.json` and `package-lock.json`. The version in the repository stays `0.0.0-development`.

### Release session steps

After `gh release create`, do these steps:

1. Wait for the run of `release.yml` for the tag: `gh run list --workflow release.yml --limit 1`, then `gh run watch <run-id> --exit-status`.
2. Check the assets: `gh release view <tag> --json assets`. The release must have the tarball and the `.sha256` file.
3. If the run fails because of the workflow, fix the workflow on `main` with a PR. Then run `gh run rerun <run-id>` for the same tag. Do not move or delete the tag. Do not make a new tag for an asset problem.

## Dependencies

All dependencies have exact versions. ESLint is at version 9 because `eslint-plugin-jsx-a11y` does not support ESLint 10 yet.

// Starts PostgreSQL, Valkey, and the identity service with testcontainers.
// See docs/development.md.
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { GenericContainer, Network, Wait } from 'testcontainers';

export const IDENTITY_IMAGE = 'ghcr.io/techorionai/constellation-identity:0.6.0';
export const POSTGRES_IMAGE = 'postgres:18.7-alpine';
export const VALKEY_IMAGE = 'valkey/valkey:9.0.7-alpine';
export const CLIENT_ID = 'ui-kit-demo';

const DB_PASSWORD = 'integration-test-password';

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** The clients file: one public client with the app `identity`. The loopback URIs match any port. */
const clientsFile = `clients:
  - id: ${CLIENT_ID}
    app: identity
    type: public
    name: UI kit demo
    redirect_uris:
      - http://127.0.0.1/auth/callback
    post_logout_redirect_uris:
      - http://127.0.0.1/
`;

async function startIdentity(port, network, requireMfaForAdmins) {
  return new GenericContainer(IDENTITY_IMAGE)
    .withNetwork(network)
    .withEnvironment({
      // The issuer must be known before the start, so the host port is fixed.
      IDENTITY_ISSUER: `http://localhost:${port}`,
      IDENTITY_CLIENTS_FILE: '/etc/identity/clients.yaml',
      IDENTITY_SECRETS__MASTER_KEY: randomBytes(32).toString('base64'),
      IDENTITY_SECRETS__MASTER_KEY_ID: 'test',
      IDENTITY_DATABASE__URL: `postgres://postgres:${DB_PASSWORD}@postgres:5432/identity?sslmode=disable`,
      IDENTITY_DATABASE__NAME: 'identity',
      IDENTITY_VALKEY__ADDRESS: 'valkey:6379',
      IDENTITY_VALKEY__KEY_PREFIX: 'identity',
      IDENTITY_MFA__REQUIRE_FOR_ADMINS: String(requireMfaForAdmins),
      // The tests make many logins from one address. The rate limits are not under test.
      IDENTITY_RATE_LIMIT__ENABLED: 'false',
    })
    .withCopyContentToContainer([{ content: clientsFile, target: '/etc/identity/clients.yaml' }])
    .withExposedPorts({ container: 8080, host: port })
    .withHealthCheck({
      test: ['CMD', '/identity', 'healthcheck'],
      interval: 2_000,
      timeout: 3_000,
      retries: 30,
      startPeriod: 1_000,
    })
    .withWaitStrategy(Wait.forHealthCheck())
    .withStartupTimeout(120_000)
    .start();
}

/**
 * Start one complete set: a network, PostgreSQL, Valkey, and identity.
 * Return the issuer, a function that prints a setup link, and a function that stops all.
 */
export async function startIdentityStack({ requireMfaForAdmins }) {
  const network = await new Network().start();
  const started = [];
  const stop = async () => {
    for (const container of started.reverse()) {
      await container.stop({ timeout: 5_000 }).catch(() => {});
    }
    await network.stop().catch(() => {});
  };
  try {
    const postgres = await new GenericContainer(POSTGRES_IMAGE)
      .withNetwork(network)
      .withNetworkAliases('postgres')
      .withEnvironment({ POSTGRES_PASSWORD: DB_PASSWORD, POSTGRES_DB: 'identity' })
      .withHealthCheck({
        test: ['CMD-SHELL', 'pg_isready -U postgres -d identity'],
        interval: 1_000,
        timeout: 3_000,
        retries: 30,
      })
      .withWaitStrategy(Wait.forHealthCheck())
      .start();
    started.push(postgres);
    const valkey = await new GenericContainer(VALKEY_IMAGE)
      .withNetwork(network)
      .withNetworkAliases('valkey')
      .withHealthCheck({
        test: ['CMD-SHELL', 'valkey-cli ping | grep -q PONG'],
        interval: 1_000,
        timeout: 3_000,
        retries: 30,
      })
      .withWaitStrategy(Wait.forHealthCheck())
      .start();
    started.push(valkey);

    // The port can be taken between the probe and the start. Try one more time with a new port.
    let identity;
    let port;
    for (let attempt = 0; attempt < 2 && !identity; attempt += 1) {
      port = await freePort();
      try {
        identity = await startIdentity(port, network, requireMfaForAdmins);
      } catch (error) {
        if (attempt === 1) throw error;
      }
    }
    started.push(identity);

    return {
      issuer: `http://localhost:${port}`,
      /** Print a new first-admin setup link. */
      async setupLink() {
        const result = await identity.exec(['/identity', 'setup-link']);
        if (result.exitCode !== 0) throw new Error('identity setup-link failed');
        const link = result.output
          .trim()
          .split(/\s+/)
          .find((word) => word.includes('/setup?token='));
        if (!link) throw new Error('identity setup-link printed no link');
        return link;
      },
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

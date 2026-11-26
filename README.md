# constellation-ui-kit

The shared UI kit of the Constellation platform. It has the Mantine theme, the provider, shared React components, and the parser for API errors (RFC 9457). Applications such as the helpdesk UI use it.

## Install

The kit is not in a package registry. Each release has a tarball. Add the tarball URL to `package.json` of your application:

```json
{
  "dependencies": {
    "@techorionai/constellation-ui-kit": "https://github.com/techorionai/constellation-ui-kit/releases/download/v0.1.0/techorionai-constellation-ui-kit-0.1.0.tgz"
  }
}
```

Then run `npm install`. npm writes the `integrity` hash to `package-lock.json`. See [docs/install.md](docs/install.md) for the peer dependencies and the update steps.

## Use

Import the three style files one time. Use the Vite plugin so the color scheme is set before the first paint.

```ts
// vite.config.ts
import { constellationColorScheme } from '@techorionai/constellation-ui-kit/vite';

export default defineConfig({ plugins: [react(), constellationColorScheme()] });
```

```tsx
// main.tsx
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@techorionai/constellation-ui-kit/styles.css';
import { AppLayout, ConstellationProvider, PageHeader } from '@techorionai/constellation-ui-kit';

function App() {
  return (
    <ConstellationProvider>
      <AppLayout appName="Helpdesk" navItems={[{ label: 'Tickets', path: '/tickets' }]}>
        <PageHeader title="Tickets" />
      </AppLayout>
    </ConstellationProvider>
  );
}
```

## Login

Applications log in users through the identity service. The kit has no login form. It sends the user to the hosted login of identity.

```tsx
import {
  AuthCallback,
  AuthProvider,
  RequireAuth,
  UserMenu,
} from '@techorionai/constellation-ui-kit';

<AuthProvider
  issuer="https://id.example.com"
  clientId="helpdesk-ui"
  scopes={['helpdesk:ticket:read']}
  appName="Helpdesk"
>
  <AppLayout appName="Helpdesk" navItems={[]} headerRight={<UserMenu />}>
    {/* Render AuthCallback at /auth/callback. Put protected pages in RequireAuth. */}
  </AppLayout>
</AuthProvider>;
```

See [docs/login.md](docs/login.md) for the client registration, the callback route, step-up, and logout.

## Documentation

- [Install](docs/install.md)
- [Theme, color scheme, and Content Security Policy](docs/theme.md)
- [Login on identity](docs/login.md)
- [Components and API errors](docs/components.md)
- [Development, tests, and release](docs/development.md)

## License

MIT

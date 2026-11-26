# Login

The kit logs users in through the identity service. The kit has no password form. All login methods (password, TOTP, passkeys, Google, and Microsoft) stay on the hosted pages of identity.

## The flow

The kit uses the OpenID Connect authorization code flow with PKCE (`S256`) and a public client. The user goes to the hosted login of identity with a full-page redirect and comes back to the callback route of the application.

1. At start, `AuthProvider` makes a silent authorization request with `prompt=none`. If the identity session is valid, identity gives a code at once and the user sees no login form. If not, identity answers `login_required`, and the application shows `LoginPage`.
2. The user clicks "Log in". The kit makes a new authorization request and goes to identity. Identity shows its login page.
3. Identity redirects to the callback route. `AuthCallback` checks the response, exchanges the code, and goes to the return path.
4. The access token goes in the `Authorization` header of the API requests. The kit refreshes it with the refresh token.

The kit uses the library `oauth4webapi` for PKCE, the request checks, the code exchange, the ID token claim checks, the refresh, and the revocation. `oauth4webapi` is a dependency of the kit with an exact version. The library build keeps it external.

## Register the application

1. Register a public client in the identity clients file:

   ```yaml
   - id: helpdesk-ui
     app: helpdesk
     type: public
     name: Helpdesk UI
     redirect_uris:
       - https://helpdesk.example.com/auth/callback
     post_logout_redirect_uris:
       - https://helpdesk.example.com/
   ```

   The match of a redirect URI is exact. For a local test, a registered `http://127.0.0.1/<path>` with no port matches any port.

2. The application must publish its permission manifest. The `scopes` prop of `AuthProvider` has the permission keys that the UI needs. Identity refuses a request that has no permission key of the `app` of the client (`invalid_scope`). The access token has the `app` of the client as its audience.
3. The Go binary of the application serves `index.html` for the path `/auth/callback` (single-page app fallback).
4. The application API checks the access token with the `platform-go` middleware, with the audience of the `app`.

## Use

```tsx
import {
  AppLayout,
  AuthCallback,
  AuthProvider,
  RequireAuth,
  UserMenu,
  createAuthFetch,
  useAuth,
} from '@techorionai/constellation-ui-kit';

function Shell() {
  const navigate = useNavigate(); // The router of the application.
  return (
    <AuthProvider
      issuer="https://id.example.com"
      clientId="helpdesk-ui"
      scopes={['helpdesk:ticket:read']}
      appName="Helpdesk"
      navigate={(path) => navigate(path, { replace: true })}
    >
      <AppLayout appName="Helpdesk" navItems={[]} headerRight={<UserMenu />}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/tickets"
            element={
              <RequireAuth>
                <Tickets />
              </RequireAuth>
            }
          />
        </Routes>
      </AppLayout>
    </AuthProvider>
  );
}

function Tickets() {
  const auth = useAuth();
  const authFetch = useMemo(() => createAuthFetch(auth), [auth]);
  // authFetch('/api/tickets') adds the bearer token.
}
```

### AuthProvider props

| Prop             | Use                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------- |
| `issuer`         | The issuer URL of identity. The value must be equal to `IDENTITY_ISSUER`.             |
| `clientId`       | The ID of the public client.                                                          |
| `scopes`         | The permission keys. The kit adds `openid`, `email`, `profile`, and `offline_access`. |
| `appName`        | The name that `LoginPage` shows.                                                      |
| `redirectPath`   | The callback route. The default is `/auth/callback`.                                  |
| `postLogoutPath` | The path where identity sends the user after the logout. The default is `/`.          |
| `navigate`       | Goes to a local path with no page load. Connect it to your router.                    |
| `loginPage`      | An element that `RequireAuth` shows instead of `LoginPage`.                           |

The default of `navigate` runs `history.replaceState` and then sends a `popstate` event. The kit never loads a new page for the return path. A page load loses the tokens in memory and starts a new silent login.

`AuthCallback` must be rendered at `redirectPath`. Until it finishes, `status` stays `loading`.

### useAuth

`useAuth()` returns:

| Field                   | Meaning                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `status`                | `loading`, `authenticated`, `unauthenticated`, or `error`.                                                                 |
| `user`                  | `sub`, `email`, `name`, `amr`, and `authTime` from the ID token. Do not use `amr` and `authTime` for permission decisions. |
| `error`                 | An `AuthError` when `status` is `error`.                                                                                   |
| `login(returnTo?)`      | Goes to identity. `returnTo` is a local path. The default is the current path.                                             |
| `logout()`              | See "Logout".                                                                                                              |
| `stepUp(maxAge?)`       | See "Step-up".                                                                                                             |
| `getAccessToken(opts?)` | Returns the access token. It refreshes the token when less than 60 seconds of life stay.                                   |

### createAuthFetch

`createAuthFetch(auth, { allowedOrigins })` returns a `fetch` function that adds `Authorization: Bearer <access token>`.

- The kit sends the token only to the origin of the application and to the origins in `allowedOrigins`. A request to any other origin gets no token.
- A 401 that is not a step-up makes one refresh and one new request. If the second answer is also 401, the caller gets it.
- A 401 with `error="insufficient_user_authentication"` makes the promise reject with `AuthError` `{ code: "insufficient_user_authentication", maxAge }`. See "Step-up".

## Tokens

- The access token, the refresh token, and the ID token stay in the memory of the tab. The kit never writes a token to `localStorage`, `sessionStorage`, IndexedDB, or a cookie.
- The `state`, the `nonce`, the `code_verifier`, the `max_age`, and the return path stay in `sessionStorage` from the redirect until the callback. The callback deletes the entry before the code exchange. The kit deletes an entry that is older than 10 minutes. The data has no token.
- The kit never writes a token, a code, a `code_verifier`, or a `state` to the console or to an error message.
- The kit checks the ID token claims `iss`, `aud`, `exp`, `iat`, `nonce`, and `azp`. It does not use the access token claims. The application API checks the access token.
- The kit does not check the ID token signature. The ID token comes directly from the token endpoint over TLS (OpenID Connect Core section 3.1.3.7).
- The return path must start with `/` and must not start with `//` or `/\`. Any other value becomes `/`.

### One refresh family for each tab

Identity rotates the refresh token at each use. If a used refresh token comes back, identity revokes the family, the session, and all other families of the session. Thus tabs must not share a refresh token.

- Each tab gets its own tokens from its own code flow. A new tab and a page reload start a silent authorization request. The session cookie of identity gives a code at once.
- Inside one tab, one promise serializes all refresh calls (single flight).
- Each page load and each step-up makes a new refresh family. The kit revokes the current refresh token before a step-up. On `pagehide` with `persisted` set to `false`, the kit sends the revoke with `navigator.sendBeacon`. If the beacon does not arrive, an old refresh family stays valid until the session ends (7 days at most by default).

## Step-up

An operation can answer 401 with `WWW-Authenticate: Bearer error="insufficient_user_authentication", max_age="300"` (RFC 9470). `createAuthFetch` then rejects with `AuthError`. It does not refresh and it does not navigate.

The application shows a message and calls `stepUp(error.maxAge)` when the user agrees. `stepUp` revokes the current refresh token and starts an authorization request with `prompt=login` and `max_age`. The return path is the current path. After the return, the application must send the request again. The kit checks `auth_time` against `max_age`.

## Logout

`logout()` does these steps:

1. It revokes the refresh token (`POST /oauth/revoke`).
2. It clears the memory.
3. It sends a `logout` message on a `BroadcastChannel` with the name `constellation-auth:<clientId>`. Other tabs of the same application clear their tokens and show `LoginPage`.
4. It goes to `/oauth/end_session` with `id_token_hint`, `post_logout_redirect_uri`, and `client_id`. Identity ends the session and all refresh families, and redirects to `postLogoutPath`.

## Errors

`AuthError` has a `code`, an optional `description`, and `maxAge` (only for the step-up). The codes are OAuth error codes, for example:

| Code                               | Cause                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `invalid_scope`                    | `scopes` has no permission key of the `app` of the client.                                                      |
| `access_denied`                    | The user or identity refused the request.                                                                       |
| `invalid_state`                    | The callback has no matching request. The request is older than 10 minutes, or the tab has no `sessionStorage`. |
| `invalid_grant`                    | The code or the refresh token is not valid. After a refresh, the kit starts a login.                            |
| `invalid_response`                 | The response of identity failed a check, for example a wrong `iss` or `nonce`.                                  |
| `login_required`                   | No user has a session. `getAccessToken` rejects with it.                                                        |
| `insufficient_user_authentication` | Step-up. See above.                                                                                             |

The OAuth endpoints use the error form of RFC 6749. `AuthError` is separate from `Problem`.

A silent request that fails with `login_required` does not start a new silent request in the same page load. This stops a redirect loop.

## Server metadata

The kit makes no discovery request. Identity sends no CORS headers for `/.well-known/openid-configuration`, so a browser on the application origin cannot read it. The kit builds the metadata from the issuer and the fixed endpoint paths: `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`, `/oauth/userinfo`, and `/oauth/end_session`. The integration test compares them with the discovery document of the identity image.

Only `/oauth/token`, `/oauth/revoke`, and `/oauth/userinfo` answer CORS requests. The allowed origins are the origins of the redirect URIs of the enabled public clients.

## Content Security Policy

Use the policy of [theme.md](theme.md) with `connect-src 'self' <issuer>`:

```txt
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://id.example.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

Scripts have no `unsafe-inline` and no `unsafe-eval`. The login is a top-level navigation, so `form-action` and `frame-src` need no issuer value. The hosted pages of identity send `frame-ancestors 'none'`, so they cannot be in a frame.

## Limits

- There is no single logout across applications. Identity has no back-channel or front-channel logout. Other applications keep their access tokens until they expire (15 minutes at most).
- There is no backend for frontend (BFF). A token in the memory of the page is open to a cross-site scripting (XSS) attack in the application. The controls are memory-only storage, a strict CSP, short access tokens, and the refresh reuse detection of identity.
- The hosted pages of identity have no theme of the application.
- Each reload makes one redirect to identity. This is fast when the session is valid. It needs no third-party cookie, because it is a top-level navigation.

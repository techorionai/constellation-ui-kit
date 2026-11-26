# Theme

## ConstellationProvider

`ConstellationProvider` wraps `MantineProvider` with `constellationTheme` and the color scheme `auto`. It also adds `Notifications`. Put it at the root of your application.

```tsx
<ConstellationProvider theme={{ primaryColor: 'teal' }}>
  <App />
</ConstellationProvider>
```

The `theme` prop is optional. The kit merges it with `constellationTheme` with `mergeThemeOverrides`. Your values win. Other kit values stay.

The provider sets the color of dimmed text to a value with a contrast of 4.5:1 or more in the light scheme and in the dark scheme.

## Color scheme script

The first paint must use the right color scheme. If it does not, the page flashes. The kit gives a static script that does this work before React renders. The script:

1. Reads the Mantine color scheme value from `localStorage`.
2. Resolves `auto` with `matchMedia('(prefers-color-scheme: dark)')`.
3. Sets `data-mantine-color-scheme` on the `html` element.
4. Catches all storage errors.

Use it in one of two ways:

- Vite plugin (recommended). Add `constellationColorScheme()` from `@techorionai/constellation-ui-kit/vite` to the Vite plugins. The plugin emits `color-scheme.js` as a build asset. It adds `<script src>` as the first element of `head`. The script has no `defer`, so it runs before the first paint.
- Static file. Copy `@techorionai/constellation-ui-kit/color-scheme.js` to your public folder. Add `<script src="/color-scheme.js"></script>` as the first element of `head`.

The kit does not use the inline `ColorSchemeScript` of Mantine. An inline script needs `script-src 'unsafe-inline'`.

## Fonts and icons

The theme uses the system font stack. The kit loads no web font and calls no CDN. This follows the rule that the platform sends traffic only to services that the admin configures.

Components take icons as `ReactNode` props. `ColorSchemeToggle` uses inline SVG.

## Content Security Policy

The kit works with this policy:

```txt
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

Scripts have no `unsafe-inline` and no `unsafe-eval`.

`style-src` has `'unsafe-inline'` for this reason: `MantineProvider` adds `<style>` elements with the theme CSS variables at run time. Mantine components also set inline `style` attributes with CSS variables. A nonce does not cover `style` attributes. Thus `'unsafe-inline'` is necessary for styles. Inline scripts are the main risk of cross-site scripting, and the policy blocks them.

An application that uses the login adds `connect-src 'self' <issuer>`, so the kit can call the token, revoke, and userinfo endpoints of identity. See [login.md](login.md).

The integration test of the kit runs a consumer application with this policy and checks that the page has zero violations.

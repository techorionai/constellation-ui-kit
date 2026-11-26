# Components and API errors

All components must be inside `ConstellationProvider`.

## AppLayout

Application shell. It has a header with the application name, `ColorSchemeToggle`, and a slot for the user menu. It has a navbar with links. On a small screen the navbar folds and a burger button opens it. The component does not depend on a router.

| Prop          | Type                       | Meaning                                                         |
| ------------- | -------------------------- | --------------------------------------------------------------- |
| `appName`     | `string`                   | Name in the header.                                             |
| `navItems`    | `{ label, path, icon? }[]` | Navigation links. `icon` is a `ReactNode`.                      |
| `renderLink`  | `(item) => ReactNode`      | Renders one link. Use it for a router link. Default: plain `a`. |
| `headerRight` | `ReactNode`                | Slot at the right of the header, for example a user menu.       |

```tsx
<AppLayout
  appName="Helpdesk"
  navItems={[{ label: 'Tickets', path: '/tickets' }]}
  renderLink={(item) => <NavLink to={item.path}>{item.label}</NavLink>}
  headerRight={<UserMenu />}
>
  {children}
</AppLayout>
```

## PageHeader

Title (`h1`), optional `description`, and an `actions` slot.

## ColorSchemeToggle

Button that changes the color scheme between light and dark. It has an accessible name that tells the next scheme.

## LoadingState

Centered loader with a visible text and `role="status"`. Prop `text` (default "Loading").

## EmptyState

Props: `icon`, `title`, `titleOrder` (2, 3, or 4, default 2), `text`, and `action`.

## ProblemAlert

Shows a `Problem`: the title, the detail, the field errors as a list, and the request ID with a copy button. It never shows a stack or a raw body.

```tsx
<ProblemAlert problem={problem} />
```

## ConfirmAction

Button that opens a modal with a text, a "Cancel" button, and a "Continue" button.

| Prop           | Meaning                                     |
| -------------- | ------------------------------------------- |
| `label`        | Text of the button that opens the modal.    |
| `title`        | Title of the modal. Default: the label.     |
| `message`      | Text of the modal.                          |
| `onConfirm`    | Function that returns a promise or nothing. |
| `danger`       | If true, the "Continue" button is red.      |
| `confirmLabel` | Text of the "Continue" button.              |

While the promise runs, "Continue" shows a loader and the two buttons are disabled. A second click does not call `onConfirm` again. If the promise rejects with a `Problem`, the modal shows it with `ProblemAlert`. If it rejects with another value, the modal shows a general `Problem` ("Request failed") and no error text.

## NotFoundPage

Text "Page not found" and a link to the home page. Props `homePath` (default `/`) and `homeLabel`.

## ErrorBoundary

React error boundary. It shows a general message and a "Reload" button. It does not show the error text. The optional `onError` callback gets the error one time.

## Problem, isProblem, and parseProblem

`Problem` is the type of an API error (RFC 9457). The field names follow `lib/errors.tsp` of `constellation-contracts`.

```ts
interface Problem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance?: string;
  requestId?: string;
  traceId?: string;
  errors?: { field: string; code: string; message: string }[];
  missingScopes?: string[];
}
```

`isProblem(value)` is a type guard. It is true for an object with a string `title`, a number `status`, and a string `code`.

`parseProblem(response)` reads a `Response` and returns a `Problem`:

- If the content type is `application/problem+json`, or `application/json` with a string `title` and a number `status`, the result has the fields of the body that have the right type.
- A field error or a scope that has a wrong type is dropped.
- A missing or wrong `code` becomes `request_failed`. A missing or wrong `type` becomes `about:blank`.
- `status` is always the HTTP status of the response.
- In all other cases the result is `{ type: "about:blank", title: "Request failed", status, code: "request_failed" }`. It has no body text.
- The function never throws for a bad body.

```ts
const response = await fetch('/api/tickets');
if (!response.ok) {
  const problem = await parseProblem(response);
  setProblem(problem);
}
```

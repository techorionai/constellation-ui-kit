import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import { AuthController } from './controller';
import type { AuthApi } from './types';

export interface AuthProviderProps {
  /** The issuer of the identity service, for example `https://id.example.com`. */
  issuer: string;
  /** The ID of the public client in the identity clients file. */
  clientId: string;
  /** The permission keys that the UI needs. The kit adds the OpenID scopes. */
  scopes: string[];
  /** The name of the application. `LoginPage` shows it. */
  appName: string;
  /** The path of the callback route. The default is `/auth/callback`. */
  redirectPath?: string;
  /** The path where identity sends the user after the logout. The default is `/`. */
  postLogoutPath?: string;
  /**
   * Go to a local path with no page load. Connect it to the router of the application.
   * The default is `history.replaceState` followed by a `popstate` event.
   */
  navigate?: (path: string) => void;
  /** Replaces the default `LoginPage` in `RequireAuth`. */
  loginPage?: ReactElement;
  /** @internal Replaces `window.location.assign`. Tests use it. */
  redirect?: (url: string) => void;
  children?: ReactNode;
}

interface AuthContextValue {
  controller: AuthController;
  appName: string;
  issuer: string;
  loginPage?: ReactElement;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function defaultNavigate(path: string): void {
  window.history.replaceState(window.history.state, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Holds the login state of the tab. At start it runs the silent login. */
export function AuthProvider({
  issuer,
  clientId,
  scopes,
  appName,
  redirectPath = '/auth/callback',
  postLogoutPath = '/',
  navigate,
  loginPage,
  redirect,
  children,
}: AuthProviderProps) {
  const issuerBase = issuer.replace(/\/+$/, '');
  const scopeKey = scopes.join(' ');
  const controller = useMemo(
    () =>
      new AuthController({
        config: {
          issuer: issuerBase,
          clientId,
          scopes: scopeKey ? scopeKey.split(' ') : [],
          redirectUri: window.location.origin + redirectPath,
          postLogoutRedirectUri: window.location.origin + postLogoutPath,
        },
        redirectPath,
        navigate: defaultNavigate,
      }),
    [issuerBase, clientId, scopeKey, redirectPath, postLogoutPath],
  );
  // The handlers change with the props. The controller stays the same.
  useEffect(() => {
    controller.setHandlers({ navigate: navigate ?? defaultNavigate, redirect });
  }, [controller, navigate, redirect]);
  useEffect(() => controller.start(), [controller]);
  const value = useMemo(
    () => ({ controller, appName, issuer: issuerBase, loginPage }),
    [controller, appName, issuerBase, loginPage],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Use this component inside AuthProvider.');
  return value;
}

/** The login state and the login actions. */
export function useAuth(): AuthApi {
  const { controller } = useAuthContext();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return useMemo(() => ({ ...state, ...controller.api() }), [state, controller]);
}

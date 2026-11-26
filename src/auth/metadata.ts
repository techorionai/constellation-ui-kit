// The server metadata of identity. It has no import, so the integration runner can load it
// in Node.js and compare it with the discovery document.

/** The metadata from the issuer and the fixed endpoint paths of identity. */
export function serverMetadata(issuer: string) {
  const base = issuer.replace(/\/+$/, '');
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    revocation_endpoint: `${base}/oauth/revoke`,
    userinfo_endpoint: `${base}/oauth/userinfo`,
    end_session_endpoint: `${base}/oauth/end_session`,
  };
}

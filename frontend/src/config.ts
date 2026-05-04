// Build-time config. Brand-shaped fields (appTitle, appLogo) were retired
// after attestation modernisation (`attestation.ts` now drives /api/v1/manifest
// and AppBranding reads `useBrand()` directly). The remaining fields are
// infrastructure or OAuth wiring that is not yet flowing through manifest:
//
// - apiHost  — empty for same-origin (Vite dev proxies via vite.config.ts;
//              prod nginx serves /api/v1/* off auth.<domain>); set explicitly
//              only for cross-origin scenarios.
// - clientId / scope — OAuth2 client_id+scope of the auth SPA itself, used
//              for /oauth2/authorize bootstrap. Could move into manifest's
//              `oauth.client_id` once /authorize flow consumes useBrand;
//              tracked separately.
// - googleClientId — Google OAuth2 client_id for the «Login with Google»
//              button. Same migration target as above.
export const config = {
  apiHost: import.meta.env.VITE_API_HOST || '',
  clientId: import.meta.env.VITE_CLIENT_ID || '',
  scope: import.meta.env.VITE_SCOPE || '',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
} as const

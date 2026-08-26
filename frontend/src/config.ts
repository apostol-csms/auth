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
//
// googleClientId is gone: the sign-in providers now arrive from the backend
// (GET /oauth2/providers) with their own client_id, so nothing about a provider
// is baked into this bundle any more. VITE_GOOGLE_CLIENT_ID in the Dockerfile
// and in the brands' build args is dead with it — removing it there is a
// separate, deploy-side change.
export const config = {
  apiHost: import.meta.env.VITE_API_HOST || '',
  clientId: import.meta.env.VITE_CLIENT_ID || '',
  scope: import.meta.env.VITE_SCOPE || '',
} as const

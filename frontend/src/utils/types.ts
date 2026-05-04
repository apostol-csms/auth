// Types for the /api/v1/manifest combined envelope (schema v2).

export interface Theme {
  primary_color?: string
  accent_color?: string
  success_color?: string
  danger_color?: string
  warning_color?: string
  info_color?: string
  bg_color?: string
  bg_alt_color?: string
  bg_muted_color?: string
  surface_color?: string
  text_color?: string
  text_muted_color?: string
  border_color?: string
  border_strong_color?: string
  border_table_color?: string
  sidebar_color?: string
  sidebar_logo_color?: string
  success_bg_color?: string
  success_border_color?: string
  danger_bg_color?: string
  danger_border_color?: string
  warning_bg_color?: string
}

// ─── License (identity claim) ────────────────────────────────────────────────

export interface LicenseBrand {
  code: string
  name: string
  legal_name: string
  tax_id: string
  email: string
  domain: string
}

export interface LicensePayload {
  iss: string
  sub: string
  jti: string
  iat: number
  exp: number
  kind: 'master' | 'tenant'
  brand: LicenseBrand
  edition: 'community' | 'pro' | 'enterprise'
  features: string[]
  limits: Record<string, number>
}

export interface CsmsDbStanza {
  ephemeral_pub: string
  cek_wrapped: string
  cek_iv: string
  cek_mac: string
}

export interface LicenseEnvelope {
  payload: LicensePayload
  signature: string
  csms_db_stanza: CsmsDbStanza
}

// ─── Manifest (runtime brand config, signed by backend) ──────────────────────

export interface ManifestBody {
  // Reserved fields filled by backend at sign time:
  version: number
  issued_at: number
  ttl?: number
  license_id: string
  brand_code: string
  // Operator-edited fields (db.brand_manifest.payload):
  brand?: {
    country_code?: string
    currency?: string
    timezone?: string
    locale?: string
    party_id?: string
    payment_system?: string
    logo_url?: string
    logo_dark_url?: string
    favicon_url?: string
    primary_color?: string
    description?: string
    support_email?: string
    sms_address?: string
    url?: string
    scope_alias?: string
  }
  oauth?: { client_id: string; scope: string }
  google?: { client_id: string }
  payment?: { stripe_publishable_key?: string }
  map?: { provider: string; api_key?: string; default_center?: [number, number] }
  theme?: { light?: Theme; dark?: Theme }
  // Allow forward-compatibility extensions.
  [key: string]: unknown
}

export interface ManifestEnvelope {
  manifest: ManifestBody
  signature: string
}

// ─── /api/v1/manifest combined response ──────────────────────────────────────

export interface ManifestResponse {
  license: LicenseEnvelope
  manifest: ManifestEnvelope
}

// ─── What useBrand() returns — merged identity + config ──────────────────────

export interface VerifiedBrand {
  // Identity (from license):
  code: string
  name: string
  legal_name: string
  tax_id: string
  email: string
  domain: string
  edition: string
  features: string[]
  limits: Record<string, number>
  license_id: string
  license_exp: number
  // Config (from manifest):
  country_code?: string
  currency?: string
  timezone?: string
  locale?: string
  party_id?: string
  payment_system?: string
  logo_url?: string
  logo_dark_url?: string
  favicon_url?: string
  primary_color?: string
  description?: string
  support_email?: string
  sms_address?: string
  url?: string
  scope_alias?: string
  oauth?: { client_id: string; scope: string }
  google?: { client_id: string }
  payment?: { stripe_publishable_key?: string }
  map?: { provider: string; api_key?: string; default_center?: [number, number] }
  theme: { light: Theme; dark: Theme }
  manifest_version: number
  manifest_issued_at: number
  manifest_ttl: number
}

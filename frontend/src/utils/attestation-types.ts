// Shape of /api/v1/session/init response + the derived useBrand() type.

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

export interface LicensePayload {
  iss: string
  sub: string
  jti: string
  iat: number
  exp: number
  kind: 'master' | 'tenant'
  deployment_fp: string
  accepted_binary_hashes: string[]
  brand: Record<string, unknown>
  oauth: { client_id: string; scope: string }
  payment?: { stripe_publishable_key?: string }
  map?: { provider: string; key?: string; default_center?: [number, number] }
  edition: 'community' | 'pro' | 'enterprise'
  features: string[]
  limits: Record<string, number>
  brand_pubkey?: string
}

export interface LicenseEnvelope {
  payload: LicensePayload
  signature: string
}

export interface AttestationPayload {
  nonce: string
  iat: number
  ttl: number
  brand?: Record<string, unknown>
  oauth?: { client_id: string; scope: string }
  payment?: { stripe_publishable_key?: string }
  map?: { provider: string; key?: string; default_center?: [number, number] }
  edition?: string
  features?: string[]
  limits?: Record<string, number>
  binary_hash?: string
  license_id?: string
  license_exp?: number
  deployment_fp?: string
}

export interface AttestationResponse {
  payload: AttestationPayload
  signature: string
  license: LicenseEnvelope
}

// What useBrand() returns — flattened + typed.
export interface VerifiedBrand {
  code: string
  name: string
  legal_name?: string
  description?: string
  email?: string
  support_email?: string
  domain: string
  url: string
  sms_address?: string
  locale: string
  country_code: string
  currency: string
  timezone?: string
  party_id: string
  payment_system?: string
  logo_url: string
  logo_dark_url?: string
  favicon_url: string
  primary_color?: string
  theme: { light: Theme; dark: Theme }

  oauth: { client_id: string; scope: string }
  payment?: { stripe_publishable_key?: string }
  map?: { provider: string; key?: string; default_center?: [number, number] }

  edition: string
  features: string[]
  limits: Record<string, number>

  license_id: string
  license_exp: number
  attestation_iat: number
  attestation_ttl: number
  binary_hash: string
  deployment_fp: string
}

// Attestation verifier for /api/v1/manifest (schema v2 / 2026-04-28 rework).
//
// Chain:
//   1. fetch /api/v1/manifest
//   2. verify license.signature with embedded PK_platform
//   3. derive brand_signing_pub = Ed25519_pub(SHA256(license.signature || "manifest-sign-v1"))
//   4. verify manifest.signature with brand_signing_pub
//   5. cross-check manifest.license_id === license.payload.jti
//   6. cross-check manifest.brand_code === license.payload.brand.code
//   7. license.exp > now and manifest.issued_at + ttl > now
//
// Throws AttestationError on any failure; never returns partial state.

import { verifyAsync, getPublicKeyAsync, etc as nobleEtc } from '@noble/ed25519'
import { sha256 } from '@noble/hashes/sha256'
import { sha512 } from '@noble/hashes/sha512'

import { canonicalizeBytes } from './canonical'
import type {
  VerifiedBrand,
  LicenseEnvelope,
  ManifestEnvelope,
  ManifestResponse,
  Theme,
} from './types'

// @noble/ed25519 v2 expects the caller to wire SHA-512 (no built-in hash).
;(nobleEtc as unknown as { sha512Sync?: (m: Uint8Array) => Uint8Array }).sha512Sync = (m) => sha512(m)

const MANIFEST_SIGN_DOMAIN = new TextEncoder().encode('manifest-sign-v1')

// Clock skew tolerance for issued_at + ttl < now. Browser clocks drift;
// 5 minutes is the de-facto industry default (RFC 7519 §4.1.5, Auth0/Okta/
// AWS Cognito). Backend rebuilds the envelope at half-TTL (OCSP-stapling
// pattern, RFC 6066 §8) so a healthy backend never serves a near-expiry one.
const CLOCK_SKEW_TOLERANCE_S = 300

export class AttestationError extends Error {
  constructor(public category: string, message: string) {
    super(message)
    this.name = "AttestationError"
    Object.setPrototypeOf(this, AttestationError.prototype)
  }
}

// ─── Parse Ed25519 public key from PEM (SubjectPublicKeyInfo DER) ──────────

export function parsePubkeyPem(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '')
  if (!b64) throw new AttestationError('pem', 'empty PEM body')
  const der = atobToBytes(b64)
  if (der.length < 32) throw new AttestationError('pem', `DER too short (${der.length})`)
  // Ed25519 SPKI canonical prefix: 30 2a 30 05 06 03 2b 65 70 03 21 00.
  // Validate prefix to refuse "32 random trailing bytes" PEMs that would
  // silently parse to a garbage key and fail later as invalid signature.
  if (der.length === 44
      && der[0] === 0x30 && der[1] === 0x2a && der[2] === 0x30
      && der[3] === 0x05 && der[4] === 0x06 && der[5] === 0x03
      && der[6] === 0x2b && der[7] === 0x65 && der[8] === 0x70
      && der[9] === 0x03 && der[10] === 0x21 && der[11] === 0x00) {
    return der.slice(12)
  }
  throw new AttestationError('pem', 'not a canonical Ed25519 SubjectPublicKeyInfo')
}

function atobToBytes(b64: string): Uint8Array {
  const bin = typeof atob !== 'undefined'
    ? atob(b64)
    : Buffer.from(b64, 'base64').toString('binary')
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function b64d(s: string): Uint8Array {
  return atobToBytes(s)
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export interface VerifyOptions {
  apiHost: string                   // "" for same-origin, or "https://api.<brand>"
  platformPubkey: Uint8Array        // 32 raw bytes
  fetchImpl?: typeof fetch
}

export async function fetchAndVerifyManifest(opts: VerifyOptions): Promise<VerifiedBrand> {
  const url = `${opts.apiHost}/api/v1/manifest`
  const f = opts.fetchImpl ?? fetch

  let body: ManifestResponse
  try {
    const resp = await f(url, { credentials: 'omit' })
    if (!resp.ok) {
      throw new AttestationError('http', `${resp.status} ${resp.statusText}`)
    }
    body = (await resp.json()) as ManifestResponse
  } catch (e) {
    if (e instanceof AttestationError) throw e
    if (e instanceof SyntaxError) throw new AttestationError('parse', e.message)
    throw new AttestationError('network', (e as Error).message || 'fetch failed')
  }

  return verifyResponse(body, opts.platformPubkey)
}

// Exposed so tests can feed a response object directly.
export async function verifyResponse(
  body: ManifestResponse,
  platformPubkey: Uint8Array,
): Promise<VerifiedBrand> {
  // Structural checks.
  if (!body || typeof body !== 'object'
      || !body.license || typeof body.license !== 'object'
      || !body.license.payload || typeof body.license.signature !== 'string'
      || !body.manifest || typeof body.manifest !== 'object'
      || !body.manifest.manifest || typeof body.manifest.signature !== 'string')
  {
    throw new AttestationError('shape', 'response missing required fields')
  }

  const license: LicenseEnvelope = body.license
  const manifestEnv: ManifestEnvelope = body.manifest

  // 1. Verify license.signature with embedded PK_platform.
  const licenseCanonical = canonicalizeBytes(license.payload)
  const licenseSig = b64d(license.signature)
  if (licenseSig.length !== 64) {
    throw new AttestationError('sig-platform', 'signature wrong length')
  }
  const platformOk = await verifyAsync(licenseSig, licenseCanonical, platformPubkey)
  if (!platformOk) {
    throw new AttestationError('sig-platform', 'license signature invalid')
  }

  // 2. Derive brand_signing_pub = Ed25519_pub(SHA256(licenseSig || "manifest-sign-v1")).
  const seedInput = new Uint8Array(licenseSig.length + MANIFEST_SIGN_DOMAIN.length)
  seedInput.set(licenseSig, 0)
  seedInput.set(MANIFEST_SIGN_DOMAIN, licenseSig.length)
  const signingSeed = sha256(seedInput)
  const brandSigningPub = await getPublicKeyAsync(signingSeed)

  // 3. Verify manifest.signature.
  const manifestCanonical = canonicalizeBytes(manifestEnv.manifest)
  const manifestSig = b64d(manifestEnv.signature)
  if (manifestSig.length !== 64) {
    throw new AttestationError('sig-manifest', 'manifest signature wrong length')
  }
  const brandOk = await verifyAsync(manifestSig, manifestCanonical, brandSigningPub)
  if (!brandOk) {
    throw new AttestationError('sig-manifest', 'manifest signature invalid')
  }

  // 4. Cross-link: license_id ↔ jti.
  if (manifestEnv.manifest.license_id !== license.payload.jti) {
    throw new AttestationError('license-id', 'manifest.license_id does not match license.jti')
  }

  // 5. Cross-link: brand_code ↔ brand.code.
  if (manifestEnv.manifest.brand_code !== license.payload.brand.code) {
    throw new AttestationError('brand-code', 'manifest.brand_code does not match license.brand.code')
  }

  // 6. License expiry.
  const now = Math.floor(Date.now() / 1000)
  if (typeof license.payload.exp === 'number' && license.payload.exp < now) {
    throw new AttestationError('expired', `license expired at ${license.payload.exp}`)
  }

  // 7. Manifest TTL — throws on stale. Backend pre-emptively rebuilds at
  // half-TTL (OCSP-stapling pattern); CLOCK_SKEW_TOLERANCE_S forgives small
  // device-clock drift (RFC 7519 §4.1.5).
  const issued = manifestEnv.manifest.issued_at ?? 0
  const ttl    = manifestEnv.manifest.ttl ?? 3600
  if (issued > 0 && issued + ttl + CLOCK_SKEW_TOLERANCE_S < now) {
    throw new AttestationError('manifest-stale', `manifest expired (issued=${issued}, ttl=${ttl})`)
  }

  return buildVerifiedBrand(license, manifestEnv)
}

// ─── Merge identity (license) + config (manifest) ──────────────────────────

function buildVerifiedBrand(
  license: LicenseEnvelope,
  manifestEnv: ManifestEnvelope,
): VerifiedBrand {
  const lic = license.payload
  const m = manifestEnv.manifest
  const mb = (m.brand ?? {}) as NonNullable<typeof m.brand>
  const theme = (m.theme ?? {}) as { light?: Theme; dark?: Theme }

  return {
    // Identity:
    code:       lic.brand.code,
    name:       lic.brand.name,
    legal_name: lic.brand.legal_name,
    tax_id:     lic.brand.tax_id,
    email:      lic.brand.email,
    domain:     lic.brand.domain,
    edition:    lic.edition,
    features:   lic.features ?? [],
    limits:     lic.limits ?? {},
    license_id: lic.jti,
    license_exp: lic.exp,
    // Config:
    country_code:   mb.country_code,
    currency:       mb.currency,
    timezone:       mb.timezone,
    locale:         mb.locale,
    party_id:       mb.party_id,
    payment_system: mb.payment_system,
    logo_url:       mb.logo_url,
    logo_dark_url:  mb.logo_dark_url,
    favicon_url:    mb.favicon_url,
    primary_color:  mb.primary_color,
    description:    mb.description,
    support_email:  mb.support_email,
    sms_address:    mb.sms_address,
    url:            mb.url,
    scope_alias:    mb.scope_alias,
    oauth:          m.oauth,
    google:         m.google,
    payment:        m.payment,
    map:            m.map,
    theme: {
      light: (theme.light ?? {}) as Theme,
      dark:  (theme.dark  ?? {}) as Theme,
    },
    manifest_version:   m.version,
    manifest_issued_at: m.issued_at,
    manifest_ttl:       m.ttl ?? 3600,
  }
}

// Backward-compat name re-export so existing callers (plugin) compile during
// transition. New code should import fetchAndVerifyManifest directly.
export const fetchAndVerify = fetchAndVerifyManifest

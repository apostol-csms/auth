// Attestation verifier for /api/v1/session/init — frontend trust anchor.
//
// Executes the Option C chain (Resolution 01):
//   1. Fetch /api/v1/session/init?nonce=<random>
//   2. Verify license.signature over canonical(license.payload) with platform pubkey
//   3. Extract brand_pubkey from license.payload (base64 raw Ed25519)
//   4. Verify attestation.signature over canonical(attestation.payload) with brand_pubkey
//   5. Cross-check: nonce, license_id = license.jti, deployment_fp, exp > now
//
// Release-manifest check (binary_hash ∈ manifest) is wired as an optional
// step — skipped if the manifest URL is not configured. Phase 5.x + Phase
// 10 flip it on once the manifest is published.
//
// Throws AttestationError on any failure; never returns partial state.

import { verifyAsync } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'

import { canonicalizeBytes } from './canonical'
import type { VerifiedBrand, LicenseEnvelope, AttestationResponse, Theme } from './attestation-types'

// @noble/ed25519 v2 expects the caller to wire SHA-512 (no built-in hash).
import { etc as nobleEtc } from '@noble/ed25519'
;(nobleEtc as unknown as { sha512Sync?: (m: Uint8Array) => Uint8Array }).sha512Sync = (m) => sha512(m)

export class AttestationError extends Error {
  constructor(public category: string, message: string) {
    super(message)
    this.name = 'AttestationError'
  }
}

// ─── Parse Ed25519 public key from PEM (SubjectPublicKeyInfo DER) ──────────
//
// Ed25519 SPKI DER: 0x30 0x2a 0x30 0x05 0x06 0x03 0x2b 0x65 0x70 0x03 0x21 0x00 <32-byte key>
// i.e. the last 32 bytes of the DER are the raw public key.

export function parsePubkeyPem(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '')
  if (!b64) throw new AttestationError('pem', 'empty PEM body')
  const der = atobToBytes(b64)
  if (der.length < 32) throw new AttestationError('pem', `DER too short (${der.length})`)
  return der.slice(der.length - 32)
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

function hexRandom(bytes: number): string {
  const arr = new Uint8Array(bytes)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr)
  } else {
    // Node fallback — fine for SSR.
    const { randomBytes } = require('crypto')
    arr.set(randomBytes(bytes))
  }
  let hex = ''
  for (const b of arr) hex += b.toString(16).padStart(2, '0')
  return hex
}

// ─── Main verification entry point ──────────────────────────────────────────

export interface VerifyOptions {
  apiHost: string                      // e.g. "" for same-origin, or "https://api.chargemecar.com"
  platformPubkey: Uint8Array           // 32 raw bytes
  nonce?: string                        // hex; generated if omitted
  fetchImpl?: typeof fetch
}

export async function fetchAndVerify(opts: VerifyOptions): Promise<VerifiedBrand> {
  const nonce = opts.nonce ?? hexRandom(32)
  const url = `${opts.apiHost}/api/v1/session/init?nonce=${encodeURIComponent(nonce)}`

  const f = opts.fetchImpl ?? fetch
  let raw: AttestationResponse
  try {
    const resp = await f(url, { credentials: 'omit' })
    if (!resp.ok) {
      throw new AttestationError('http', `${resp.status} ${resp.statusText}`)
    }
    raw = (await resp.json()) as AttestationResponse
  } catch (e) {
    if (e instanceof AttestationError) throw e
    throw new AttestationError('network', (e as Error).message || 'fetch failed')
  }

  return verifyResponse(raw, nonce, opts.platformPubkey)
}

// Exposed separately so tests / mocks can feed a response object directly.
export async function verifyResponse(
  raw: AttestationResponse,
  nonce: string,
  platformPubkey: Uint8Array,
): Promise<VerifiedBrand> {
  // Structural checks first — everything else depends on this shape.
  if (!raw || typeof raw !== 'object'
      || !raw.payload || typeof raw.payload !== 'object'
      || typeof raw.signature !== 'string'
      || !raw.license || typeof raw.license !== 'object'
      || !raw.license.payload || typeof raw.license.signature !== 'string')
  {
    throw new AttestationError('shape', 'response missing required fields')
  }

  const license: LicenseEnvelope = raw.license

  // 1. Platform signature over canonical(license.payload).
  const licenseCanonical = canonicalizeBytes(license.payload)
  const licenseSig = b64d(license.signature)
  const platformOk = await verifyAsync(licenseSig, licenseCanonical, platformPubkey)
  if (!platformOk) {
    throw new AttestationError('sig-platform', 'license signature invalid')
  }

  // 2. Extract brand pubkey from license.payload.
  const brandPubkeyB64 = license.payload.brand_pubkey
  if (typeof brandPubkeyB64 !== 'string') {
    throw new AttestationError('shape', 'license.payload.brand_pubkey missing')
  }
  const brandPubkey = b64d(brandPubkeyB64)
  if (brandPubkey.length !== 32) {
    throw new AttestationError(
      'brand-pubkey',
      `expected 32-byte Ed25519 key, got ${brandPubkey.length}`,
    )
  }

  // 3. Brand signature over canonical(raw.payload).
  const attestCanonical = canonicalizeBytes(raw.payload)
  const attestSig = b64d(raw.signature)
  const brandOk = await verifyAsync(attestSig, attestCanonical, brandPubkey)
  if (!brandOk) {
    throw new AttestationError('sig-brand', 'attestation signature invalid')
  }

  // 4. Nonce echo.
  if (raw.payload.nonce !== nonce) {
    throw new AttestationError('nonce', 'server echoed a different nonce')
  }

  // 5. Cross-check license_id ↔ license.payload.jti.
  if (raw.payload.license_id && raw.payload.license_id !== license.payload.jti) {
    throw new AttestationError(
      'license-id',
      'attestation license_id does not match license.payload.jti',
    )
  }

  // 6. License expiry (unix seconds).
  const now = Math.floor(Date.now() / 1000)
  if (typeof license.payload.exp === 'number' && license.payload.exp < now) {
    throw new AttestationError(
      'expired',
      `license expired at ${license.payload.exp} (now ${now})`,
    )
  }
  if (typeof raw.payload.license_exp === 'number' && raw.payload.license_exp < now) {
    throw new AttestationError('expired', 'attestation reports license expired')
  }

  // 7. Deployment fingerprint consistency (license vs attestation).
  if (raw.payload.deployment_fp && license.payload.deployment_fp
      && raw.payload.deployment_fp !== license.payload.deployment_fp) {
    throw new AttestationError(
      'deployment-fp',
      'attestation deployment_fp disagrees with license',
    )
  }

  // Release-manifest check deferred — documented in Phase 5/10.

  return buildVerifiedBrand(raw)
}

function buildVerifiedBrand(raw: AttestationResponse): VerifiedBrand {
  const brand = (raw.payload.brand || {}) as Record<string, unknown>
  const theme = (brand.theme || {}) as { light?: Theme; dark?: Theme }

  return {
    code: (brand.code as string) ?? 'unknown',
    name: (brand.name as string) ?? 'unknown',
    legal_name: brand.legal_name as string | undefined,
    description: brand.description as string | undefined,
    email: brand.email as string | undefined,
    support_email: brand.support_email as string | undefined,
    domain: (brand.domain as string) ?? '',
    url: (brand.url as string) ?? '',
    sms_address: brand.sms_address as string | undefined,
    locale: (brand.locale as string) ?? 'en',
    country_code: (brand.country_code as string) ?? 'EU',
    currency: (brand.currency as string) ?? 'EUR',
    timezone: brand.timezone as string | undefined,
    party_id: (brand.party_id as string) ?? '',
    payment_system: brand.payment_system as string | undefined,
    logo_url: (brand.logo_url as string) ?? '',
    logo_dark_url: brand.logo_dark_url as string | undefined,
    favicon_url: (brand.favicon_url as string) ?? '',
    primary_color: brand.primary_color as string | undefined,
    theme: {
      light: (theme.light ?? {}) as Theme,
      dark: (theme.dark ?? {}) as Theme,
    },
    oauth: (raw.payload.oauth as { client_id: string; scope: string } | undefined) ?? {
      client_id: '',
      scope: 'api',
    },
    payment: raw.payload.payment as { stripe_publishable_key?: string } | undefined,
    map: raw.payload.map as VerifiedBrand['map'],
    edition: (raw.payload.edition as string) ?? 'community',
    features: (raw.payload.features as string[]) ?? [],
    limits: (raw.payload.limits as Record<string, number>) ?? {},
    license_id: (raw.payload.license_id as string) ?? '',
    license_exp: (raw.payload.license_exp as number) ?? 0,
    attestation_iat: (raw.payload.iat as number) ?? 0,
    attestation_ttl: (raw.payload.ttl as number) ?? 0,
    binary_hash: (raw.payload.binary_hash as string) ?? '',
    deployment_fp: (raw.payload.deployment_fp as string) ?? '',
  }
}

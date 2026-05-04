import './assets/styles/base.scss'
import './assets/styles/auth.scss'

import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'

import {
  fetchAndVerifyManifest,
  parsePubkeyPem,
  AttestationError,
} from './utils/attestation'
import type { VerifiedBrand } from './utils/types'
import { BrandKey } from './composables/useBrand'

async function loadPlatformPubkey(): Promise<Uint8Array> {
  const resp = await fetch('/platform-pubkey.pem', {
    credentials: 'omit',
    cache: 'no-store',
  })
  if (!resp.ok) {
    throw new AttestationError('pubkey', `pubkey fetch HTTP ${resp.status}`)
  }
  return parsePubkeyPem(await resp.text())
}

function renderAttestationError(category: string, message: string): void {
  const rootEl = document.getElementById('app')
  if (!rootEl) return
  rootEl.innerHTML = `
    <div style="min-height:70dvh;display:flex;align-items:center;justify-content:center;padding:1rem;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
      <div style="max-width:420px;padding:1.5rem;border:1px solid rgba(0,0,0,.1);border-radius:12px;background:#fff;text-align:center;">
        <h1 style="font-size:1.125rem;margin:0 0 .5rem;color:#0d1117;">License unavailable</h1>
        <p style="color:#57606a;margin:.25rem 0 .75rem;">This deployment's license could not be verified. Contact your provider.</p>
        <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.8rem;color:#8b949e;margin:0;">Reason: ${category}</p>
      </div>
    </div>`
  // eslint-disable-next-line no-console
  console.warn('[attestation] refused:', category, message)
}

// Push verified brand into <head>: document.title + <link rel=icon>. Same
// pattern as webapp AttestationGate.tsx (favicon swap) — keeps the auth
// page in sync with what useBrand() shows.
function applyBrandToHead(brand: VerifiedBrand): void {
  if (typeof document === 'undefined') return
  if (brand.name) {
    document.title = brand.name
  }
  if (brand.favicon_url) {
    const links = document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"]',
    )
    if (links.length > 0) {
      links.forEach((l) => {
        l.href = brand.favicon_url
      })
    } else {
      const link = document.createElement('link')
      link.rel = 'icon'
      link.href = brand.favicon_url
      document.head.appendChild(link)
    }
  }
}

async function bootstrap(): Promise<void> {
  let brand: VerifiedBrand
  try {
    const platformPubkey = await loadPlatformPubkey()
    brand = await fetchAndVerifyManifest({ apiHost: '', platformPubkey })
  } catch (e) {
    const ae = e as AttestationError
    renderAttestationError(ae.category ?? 'unknown', ae.message ?? 'attestation failed')
    return
  }

  applyBrandToHead(brand)

  const app = createApp(App)
  app.provide(BrandKey, brand)
  app.use(router).use(i18n).mount('#app')
}

void bootstrap()

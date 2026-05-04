import { inject, provide, type InjectionKey } from 'vue'

import type { VerifiedBrand } from '../utils/types'

/**
 * Attestation-verified brand. Provided once by main.ts after
 * `fetchAndVerify()` resolves, consumed by pages via `useBrand()`.
 *
 * Separate surface from build-time `config.ts` (the VITE_* env values)
 * which remains during the Phase-10 cutover window.
 */
export const BrandKey: InjectionKey<VerifiedBrand> = Symbol('verified-brand')

export function provideBrand(brand: VerifiedBrand): void {
  provide(BrandKey, brand)
}

export function useBrand(): VerifiedBrand {
  const brand = inject(BrandKey)
  if (!brand) {
    throw new Error('useBrand(): no BrandKey provided — main.ts bootstrap failed?')
  }
  return brand
}

export function useBrandOptional(): VerifiedBrand | undefined {
  return inject(BrandKey)
}

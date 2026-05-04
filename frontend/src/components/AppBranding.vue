<template>
  <div class="branding">
    <img
      v-if="logoUrl && !logoBroken"
      :src="logoUrl"
      :alt="title"
      class="branding-logo"
      @error="logoBroken = true"
    />
    <h1 class="branding-title">{{ title }}</h1>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBrandOptional } from '@/composables/useBrand'
import { config } from '@/config'

// Brand from manifest (provided by main.ts after fetchAndVerify). Fall back
// to build-time config only when manifest path failed and bootstrap rendered
// us anyway — production should never see this fallback.
//
// Three-tier fallback for the logo: dark variant (auth has dark background),
// light variant, then text-only (no <img>). For the title: brand.name from
// manifest first, config.appTitle as last resort.
const brand = useBrandOptional()

const logoUrl = computed<string | null>(() => {
  if (brand) return brand.logo_dark_url || brand.logo_url || null
  return config.appLogo || null
})

const title = computed<string>(() => brand?.name || config.appTitle || '')

// If <img> fails to load (404, CORS, malformed URL), hide it gracefully
// and keep just the title — broken-image icon is worse than no icon at all.
const logoBroken = ref(false)
</script>

<style scoped>
.branding {
  text-align: center;
  margin-bottom: 1.5rem;
}
.branding-logo {
  width: 48px;
  height: 48px;
  margin-bottom: 0.5rem;
  object-fit: contain;
}
.branding-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text);
}
</style>

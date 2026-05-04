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

// Brand from manifest (provided by main.ts after fetchAndVerifyManifest).
// If the inject is missing — bootstrap failed and renderAttestationError
// already replaced #app, so we render here means manifest succeeded.
//
// Logo: prefer dark variant (auth has dark background), fall back to light,
// then no <img>. Title: brand.name; never fall back to a brand-shaped
// constant (no hardcoded "ChargeMeCar" / "Apostol" leak).
const brand = useBrandOptional()

const logoUrl = computed<string | null>(
  () => brand?.logo_dark_url || brand?.logo_url || null,
)

const title = computed<string>(() => brand?.name || '')

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

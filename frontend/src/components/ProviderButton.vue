<template>
  <button class="btn btn-outline provider-btn" @click="startLogin" :disabled="loading">
    <img v-if="provider.icon" class="provider-icon" :src="provider.icon" alt="" width="18" height="18" />
    <span>{{ t('login.withProvider', { name: name }) }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { config } from '@/config'
import type { Provider } from '@/types'

const { t, te } = useI18n()
const props = defineProps<{ provider: Provider; loading?: boolean }>()

// The provider's name in the reader's language when we have it, the backend's
// display_name when we do not. Both halves matter: "Яндекс" is not a
// transliteration a Russian reader should meet as "Yandex", and a provider
// nobody translated yet must still get a button rather than an empty label or a
// raw key. The fallback is also what keeps this screen from needing a rebuild
// when a provider is added — that is the whole point of serving the list.
const name = computed(() => {
  const key = `login.providers.${props.provider.provider}`
  return te(key) ? t(key) : props.provider.display_name
})

// CSRF state for the external sign-in (RFC 6749 §10.12). The exact shape of the
// consent token (ConsentScreen.vue), and it holds for the same reason: the value
// goes to the provider as ?state= and into a __Host- cookie the backend reads back
// on return (do_get, action "code"). A page on another origin can neither read our
// cookie to forge a matching state nor plant one under the __Host- prefix.
//
// SameSite=Lax, NOT Strict as the consent token is: the return from the provider is
// a top-level cross-site navigation, which a Strict cookie would not accompany —
// every real sign-in would then fail the backend's check. __Host- still requires
// Secure and Path=/, which the login screen is served under.
function mintState(): string {
  const state =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')

  // 30 minutes, not the consent token's 10: a first sign-in through a provider can
  // include registering an account on the provider's side, and the state must still
  // be here when the user finally returns. The window is a CSRF-token lifetime, not a
  // session — and a captured code+state is backstopped by single-use codes and cleared
  // server-side on success (AuthServer, do_get "code" branch).
  document.cookie = `__Host-OAuthState=${state}; Path=/; Secure; SameSite=Lax; Max-Age=1800`
  return state
}

function startLogin() {
  // The provider's own authorization endpoint and scope come from the list the
  // backend served (GET /oauth2/providers) — nothing about the provider is baked
  // into this bundle, so one build serves every deployment.
  const redirectUri = `${config.apiHost || window.location.origin}/oauth2/code/${props.provider.provider}`

  const params = new URLSearchParams({
    client_id: props.provider.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: props.provider.login_scope,
    state: mintState(),
    // Standard OIDC (§3.1.2.1), not a Google detail — and it is visible to the
    // user: without it, someone already signed in to one account at the provider
    // is carried straight through and never gets to pick. On a shared machine, or
    // with two accounts, "sign in as someone else" simply stops existing.
    //
    // It is here because the button it replaced sent it, and because webapp and
    // driver still do: dropping it would have made the same product behave
    // differently depending on which host the user started from — a divergence
    // the move to a served list would have carried in silently.
    //
    // The two other parameters that button sent do NOT come along:
    // access_type=online is Google's own default, and include_granted_scopes is
    // Google-specific with nothing to grant when the scope set is a single one.
    // Neither is observable; this one is.
    prompt: 'select_account',
  })

  window.location.href = `${props.provider.auth_uri}?${params}`
}
</script>

<style scoped>
.provider-btn {
  gap: 0.5rem;
}
.provider-icon {
  flex-shrink: 0;
}
</style>

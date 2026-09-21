<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../store/auth.store'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const mail = ref('')
const mdp = ref('')

async function onSubmit() {
  try {
    await authStore.login({ mail: mail.value, mdp: mdp.value })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/atelier'
    router.push(redirect)
  } catch {
    // L'erreur est déjà exposée via authStore.error.
  }
}
</script>

<template>
  <section class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
    <h1 class="text-2xl font-semibold text-gray-900">Connexion</h1>

    <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
      <div class="flex flex-col gap-1">
        <label for="mail" class="text-sm font-medium text-gray-700">E-mail</label>
        <input
          id="mail"
          v-model="mail"
          type="email"
          required
          autocomplete="email"
          class="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label for="mdp" class="text-sm font-medium text-gray-700">Mot de passe</label>
        <input
          id="mdp"
          v-model="mdp"
          type="password"
          required
          autocomplete="current-password"
          class="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <p v-if="authStore.error" class="text-sm text-red-600">{{ authStore.error }}</p>

      <button
        type="submit"
        :disabled="authStore.isLoading"
        class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {{ authStore.isLoading ? 'Connexion…' : 'Se connecter' }}
      </button>
    </form>

    <p class="text-sm text-gray-600">
      Pas encore de compte ?
      <RouterLink to="/register" class="font-medium text-gray-900 underline">S'inscrire</RouterLink>
    </p>
  </section>
</template>

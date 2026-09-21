<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../store/auth.store'

const authStore = useAuthStore()
const router = useRouter()

const nom = ref('')
const ville = ref('')
const pays = ref('')
const mail = ref('')
const mdp = ref('')
const mdpConfirmation = ref('')

const confirmationError = ref<string | null>(null)
const confirmationPending = ref(false)

async function onSubmit() {
  confirmationError.value = null

  if (mdp.value !== mdpConfirmation.value) {
    confirmationError.value = 'Les mots de passe ne correspondent pas.'
    return
  }

  try {
    const { needsEmailConfirmation } = await authStore.register({
      nom: nom.value,
      ville: ville.value,
      pays: pays.value,
      mail: mail.value,
      mdp: mdp.value,
    })

    if (needsEmailConfirmation) {
      confirmationPending.value = true
      return
    }

    router.push('/atelier')
  } catch {
    // L'erreur est déjà exposée via authStore.error.
  }
}
</script>

<template>
  <section class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
    <h1 class="text-2xl font-semibold text-gray-900">Inscription</h1>

    <p v-if="confirmationPending" class="rounded-md bg-green-50 p-3 text-sm text-green-800">
      Compte créé. Vérifie ta boîte mail pour confirmer ton adresse avant de te connecter.
    </p>

    <form v-else class="flex flex-col gap-4" @submit.prevent="onSubmit">
      <div class="flex flex-col gap-1">
        <label for="nom" class="text-sm font-medium text-gray-700">Nom</label>
        <input
          id="nom"
          v-model="nom"
          type="text"
          required
          class="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label for="ville" class="text-sm font-medium text-gray-700">Ville</label>
        <input
          id="ville"
          v-model="ville"
          type="text"
          required
          class="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label for="pays" class="text-sm font-medium text-gray-700">Pays</label>
        <input
          id="pays"
          v-model="pays"
          type="text"
          required
          class="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

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
          minlength="8"
          autocomplete="new-password"
          class="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label for="mdp-confirmation" class="text-sm font-medium text-gray-700">Confirmer le mot de passe</label>
        <input
          id="mdp-confirmation"
          v-model="mdpConfirmation"
          type="password"
          required
          autocomplete="new-password"
          class="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <p v-if="confirmationError" class="text-sm text-red-600">{{ confirmationError }}</p>
      <p v-else-if="authStore.error" class="text-sm text-red-600">{{ authStore.error }}</p>

      <button
        type="submit"
        :disabled="authStore.isLoading"
        class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {{ authStore.isLoading ? 'Création…' : 'Créer mon compte' }}
      </button>
    </form>

    <p class="text-sm text-gray-600">
      Déjà un compte ?
      <RouterLink to="/login" class="font-medium text-gray-900 underline">Se connecter</RouterLink>
    </p>
  </section>
</template>

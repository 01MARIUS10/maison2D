<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/modules/auth'

const authStore = useAuthStore()
const router = useRouter()

async function onLogout() {
  await authStore.logout()
  router.push('/login')
}
</script>

<template>
  <header class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
    <RouterLink to="/" class="text-sm font-semibold text-gray-900">maison2D</RouterLink>

    <nav class="flex items-center gap-4 text-sm text-gray-600">
      <template v-if="authStore.isAuthenticated">
        <span>{{ authStore.user?.nom }}</span>
        <button type="button" class="font-medium text-gray-900 underline" @click="onLogout">
          Déconnexion
        </button>
      </template>
      <template v-else>
        <RouterLink to="/login" class="font-medium text-gray-900">Connexion</RouterLink>
        <RouterLink to="/register" class="font-medium text-gray-900">Inscription</RouterLink>
      </template>
    </nav>
  </header>
</template>

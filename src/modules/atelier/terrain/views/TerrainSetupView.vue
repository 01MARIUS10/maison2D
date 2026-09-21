<script setup lang="ts">
defineProps<{ planId: string }>()
// Étape 1 du parcours : choix du mode de définition du terrain (GPS ou dessin manuel) — à implémenter.
</script>

<template>
  <section class="mx-auto max-w-4xl px-4 py-8">
    <RouterLink to="/atelier" class="text-sm text-gray-600 underline">← Mes ateliers</RouterLink>
    <h1 class="mt-2 text-2xl font-semibold text-gray-900">Terrain</h1>
    <p class="mt-1 text-sm text-gray-600">Définition du terrain (atelier {{ planId }}) — à implémenter.</p>
  </section>
</template>

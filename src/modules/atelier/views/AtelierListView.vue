<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePlanStore } from '../store/plan.store'
import { terrainArea } from '../terrain/services/terrain.service'

const planStore = usePlanStore()
const router = useRouter()
void planStore.load()

// « idle » dure un instant avant le départ de la requête : pour l'utilisateur, c'est déjà du chargement.
const isLoading = computed(() => planStore.status === 'idle' || planStore.status === 'loading')

const isCreating = ref(false)
const createError = ref<string | null>(null)

function openPlan(planId: string) {
  void router.push({ name: 'atelier-structure', params: { planId } })
}

async function createPlan() {
  isCreating.value = true
  createError.value = null
  try {
    const plan = await planStore.createPlan(`Atelier ${planStore.plans.length + 1}`)
    await router.push({ name: 'atelier-terrain', params: { planId: plan.id } })
  } catch (error) {
    createError.value = error instanceof Error ? error.message : "Impossible de créer l'atelier."
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <section class="mx-auto max-w-4xl px-4 py-8">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-semibold text-gray-900">Mes ateliers</h1>
      <button
        type="button"
        class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        :disabled="isCreating || isLoading"
        @click="createPlan"
      >
        {{ isCreating ? 'Création…' : '+ Nouvel atelier' }}
      </button>
    </div>

    <p v-if="createError" class="mb-4 text-sm text-red-600" role="alert">{{ createError }}</p>

    <p v-if="isLoading" class="text-sm text-gray-600" role="status">Chargement de vos ateliers…</p>

    <div v-else-if="planStore.status === 'error'" class="rounded-md border border-red-200 bg-red-50 p-4" role="alert">
      <p class="text-sm text-red-700">{{ planStore.error }}</p>
      <button
        type="button"
        class="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
        @click="planStore.load(true)"
      >
        Réessayer
      </button>
    </div>

    <p v-else-if="planStore.plans.length === 0" class="text-sm text-gray-600">Aucun atelier pour l'instant.</p>

    <ul v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <li v-for="plan in planStore.plans" :key="plan.id">
        <button
          type="button"
          class="w-full rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-gray-900"
          @click="openPlan(plan.id)"
        >
          <p class="font-medium text-gray-900">{{ plan.nom }}</p>
          <p class="mt-1 text-sm text-gray-600">
            {{ plan.rooms.length }} pièce{{ plan.rooms.length > 1 ? 's' : '' }}
            <template v-if="plan.terrain"> · terrain ≈ {{ Math.round(terrainArea(plan.terrain)) }} m²</template>
          </p>
        </button>
      </li>
    </ul>
  </section>
</template>

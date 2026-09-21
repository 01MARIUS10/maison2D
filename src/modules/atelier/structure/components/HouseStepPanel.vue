<script setup lang="ts">
import { computed } from 'vue'
import type { PlanPoint } from '@/shared/types'
import { useValidationToasts } from '@/shared/composables/useValidationToasts'
import { usePlanStore } from '../../store/plan.store'
import { terrainCentroid } from '../../terrain/services/terrain.service'
import { edgeLength, houseArea, validateHousePlacement } from '../services/structure.service'
import OpeningsEditor from './OpeningsEditor.vue'
import type { OpeningKind } from '../types'
import { roundMeters } from '../constants'
import { snapToGrid } from '../composables/usePlanViewport'

const props = defineProps<{
  planId: string
  /** Origine du plan : la position affichée est relative à ce repère (axes visibles sur le canvas). */
  origin: PlanPoint
}>()

const emit = defineEmits<{ refit: [] }>()

const planStore = usePlanStore()
const plan = computed(() => planStore.getPlanById(props.planId))
const house = computed(() => plan.value?.house ?? null)

const errors = computed(() => {
  const terrain = plan.value?.terrain
  return house.value && terrain ? validateHousePlacement(house.value, terrain) : []
})

// Le problème de placement s'affiche en toast, à son apparition.
useValidationToasts(errors)

function createHouse() {
  const terrain = plan.value?.terrain
  const center = terrain ? terrainCentroid(terrain) : { x: 0, y: 0 }
  planStore.setHouse(props.planId, {
    center: { x: snapToGrid(center.x), y: snapToGrid(center.y) },
    width: 10,
    height: 8,
    rotation: 0,
    openings: [],
  })
  emit('refit')
}

// La base de la maison n'a que des portes (les fenêtres se placent sur les pièces, à l'étape suivante).
const OPENING_KIND_LABELS: Partial<Record<OpeningKind, string>> = { entrance: "Porte d'entrée", interior: 'Autre porte' }
const OPENING_ADD_BUTTONS: { kind: OpeningKind; label: string }[] = [{ kind: 'entrance', label: '+ Porte' }]

function deleteHouse() {
  planStore.setHouse(props.planId, null)
}

// Centre affiché relativement à l'origine du plan, comme les sommets du terrain ; appliqué au `change`
// (pas à chaque frappe) pour ne pas déplacer la base pendant qu'on tape une valeur.
const center = computed(() => {
  if (!house.value) return null
  return {
    x: roundMeters(house.value.center.x - props.origin.x, 2),
    y: roundMeters(house.value.center.y - props.origin.y, 2),
  }
})

function onCenterChange(axis: 'x' | 'y', e: Event) {
  const current = house.value
  const input = e.target as HTMLInputElement
  const value = Number(input.value)
  if (!current || input.value.trim() === '' || Number.isNaN(value)) {
    if (center.value) input.value = String(center.value[axis]) // saisie invalide : on remet la valeur courante
    return
  }
  current.center = { ...current.center, [axis]: value + props.origin[axis] }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="!house" class="rounded-lg border border-gray-200 p-3">
      <h2 class="text-sm font-semibold text-gray-900">Base de la maison</h2>
      <p class="mt-1 text-sm text-gray-600">
        Pose l'emprise de la maison sur le terrain : longueur, largeur et position. Tu placeras ensuite les pièces à
        l'étape suivante.
      </p>
      <button
        type="button"
        class="mt-3 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
        @click="createHouse"
      >
        Poser la base de la maison
      </button>
    </div>

    <div v-else class="rounded-lg border border-gray-200 p-3">
      <h2 class="text-sm font-semibold text-gray-900">Base de la maison</h2>

      <div class="mt-3 grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1 text-xs text-gray-600">
          Longueur (m)
          <input
            v-model.number="house.width"
            type="number"
            step="0.5"
            min="0.5"
            class="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </label>
        <label class="flex flex-col gap-1 text-xs text-gray-600">
          Largeur (m)
          <input
            v-model.number="house.height"
            type="number"
            step="0.5"
            min="0.5"
            class="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </label>
        <label class="flex flex-col gap-1 text-xs text-gray-600">
          Rotation (°)
          <input
            v-model.number="house.rotation"
            type="number"
            step="15"
            class="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </label>
        <p class="self-end pb-1.5 text-sm text-gray-600">{{ Math.round(houseArea(house)) }} m²</p>
      </div>

      <div v-if="center" class="mt-3 flex flex-col gap-1 border-t border-gray-200 pt-3">
        <span class="text-xs text-gray-600">Position du centre (m)</span>
        <div class="flex items-center gap-1">
          <input
            type="number"
            step="0.5"
            aria-label="Centre X (m)"
            :value="center.x"
            class="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-900 focus:outline-none"
            @change="onCenterChange('x', $event)"
          />
          <input
            type="number"
            step="0.5"
            aria-label="Centre Y (m)"
            :value="center.y"
            class="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-900 focus:outline-none"
            @change="onCenterChange('y', $event)"
          />
        </div>
      </div>

      <div class="mt-3 border-t border-gray-200 pt-3">
        <OpeningsEditor
          title="Portes de la maison"
          :openings="house.openings"
          :edge-length="(edge) => edgeLength(house!, edge)"
          :kind-labels="OPENING_KIND_LABELS"
          :add-buttons="OPENING_ADD_BUTTONS"
          empty-text="Aucune porte sur la base."
          @add="planStore.addHouseOpening(planId, $event)"
          @remove="planStore.removeHouseOpening(planId, $event)"
        />
      </div>

      <button
        type="button"
        class="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
        @click="deleteHouse"
      >
        Supprimer la base
      </button>
    </div>
  </div>
</template>

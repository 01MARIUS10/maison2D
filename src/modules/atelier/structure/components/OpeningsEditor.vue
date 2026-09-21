<script setup lang="ts">
import { ROOM_EDGE_LABELS } from '../services/structure.service'
import type { EdgeOpening, OpeningKind, RoomEdge } from '../types'

/**
 * Liste éditable de portes/fenêtres percées dans les bords d'un rectangle (pièce ou base de la maison).
 * Ne connaît ni le store ni le rectangle : le parent fournit la longueur de chaque bord et reçoit
 * les ajouts/suppressions ; les champs d'une ouverture existante sont modifiés en place.
 */
const props = defineProps<{
  title: string
  openings: EdgeOpening[]
  /** Longueur (m) du bord demandé, pour centrer et borner les ouvertures. */
  edgeLength: (edge: RoomEdge) => number
  /** Types proposés dans le sélecteur d'une ouverture, avec leur libellé. */
  kindLabels: Partial<Record<OpeningKind, string>>
  /** Boutons d'ajout : un par type d'ouverture que l'on peut créer. */
  addButtons: { kind: OpeningKind; label: string }[]
  emptyText: string
}>()

const emit = defineEmits<{ add: [opening: EdgeOpening]; remove: [id: string] }>()

const EDGES: RoomEdge[] = [0, 1, 2, 3]
const DEFAULT_WIDTH: Record<OpeningKind, number> = { interior: 0.9, entrance: 1, window: 1.2 }

function add(kind: OpeningKind) {
  const edge: RoomEdge = 2
  const length = props.edgeLength(edge)
  const width = Math.min(DEFAULT_WIDTH[kind], length)
  emit('add', {
    id: crypto.randomUUID(),
    edge,
    offset: (length - width) / 2,
    width,
    kind,
  })
}

function onKindChange(opening: EdgeOpening, e: Event) {
  opening.kind = (e.target as HTMLSelectElement).value as OpeningKind
}

function onEdgeChange(opening: EdgeOpening, e: Event) {
  opening.edge = Number((e.target as HTMLSelectElement).value) as RoomEdge
  // Recentre l'ouverture sur le nouveau bord (dont la longueur peut différer de l'ancien).
  opening.offset = Math.max((props.edgeLength(opening.edge) - opening.width) / 2, 0)
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-xs font-semibold text-gray-900">{{ title }}</h3>
      <div class="flex items-center gap-3">
        <button
          v-for="button in addButtons"
          :key="button.kind"
          type="button"
          class="text-xs font-medium text-gray-900 underline"
          @click="add(button.kind)"
        >
          {{ button.label }}
        </button>
      </div>
    </div>

    <ul class="mt-2 space-y-2">
      <li v-for="opening in openings" :key="opening.id" class="space-y-1 rounded-md border border-gray-200 p-2">
        <div class="flex items-center gap-1">
          <select
            :value="opening.kind"
            aria-label="Type d'ouverture"
            class="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
            @change="onKindChange(opening, $event)"
          >
            <option v-for="(label, kind) in kindLabels" :key="kind" :value="kind">{{ label }}</option>
          </select>
          <select
            :value="opening.edge"
            aria-label="Bord"
            class="rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
            @change="onEdgeChange(opening, $event)"
          >
            <option v-for="edge in EDGES" :key="edge" :value="edge">{{ ROOM_EDGE_LABELS[edge] }}</option>
          </select>
          <button
            type="button"
            class="text-xs text-red-600 hover:text-red-700"
            aria-label="Supprimer l'ouverture"
            @click="emit('remove', opening.id)"
          >
            ✕
          </button>
        </div>
        <div class="flex items-center gap-2 text-xs text-gray-600">
          <label class="flex items-center gap-1">
            Position
            <input
              v-model.number="opening.offset"
              type="number"
              step="0.1"
              min="0"
              class="w-16 rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
            />
          </label>
          <label class="flex items-center gap-1">
            Largeur
            <input
              v-model.number="opening.width"
              type="number"
              step="0.1"
              min="0.3"
              class="w-16 rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
            />
          </label>
          <span>m</span>
        </div>
      </li>
      <li v-if="openings.length === 0" class="text-xs text-gray-500">{{ emptyText }}</li>
    </ul>
  </div>
</template>

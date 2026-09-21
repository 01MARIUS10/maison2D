<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { PlanPoint } from '@/shared/types'
import { useValidationToasts } from '@/shared/composables/useValidationToasts'
import { usePlanStore } from '../../store/plan.store'
import { CATEGORY_LABELS, WALL_TYPES, roundMeters } from '../constants'
import { snapToGrid } from '../composables/usePlanViewport'
import { ROOM_EDGE_LABELS, edgeLength, roomArea, validateRoomPlacement } from '../services/structure.service'
import OpeningsEditor from './OpeningsEditor.vue'
import type { EdgeOpening, OpeningKind, Room, RoomEdge, RoomOpening, WallType } from '../types'

const props = defineProps<{
  planId: string
  /** Origine du plan : la position affichée est relative à ce repère (axes visibles sur le canvas). */
  origin: PlanPoint
  selectedIds: string[]
}>()

const emit = defineEmits<{ 'update:selectedIds': [ids: string[]]; refit: [] }>()

const planStore = usePlanStore()
const plan = computed(() => planStore.getPlanById(props.planId))
const rooms = computed(() => plan.value?.rooms ?? [])

const selectedRooms = computed(() => rooms.value.filter((room) => props.selectedIds.includes(room.id)))
// Le formulaire d'édition ne concerne qu'une seule pièce.
const selectedRoom = computed(() => (selectedRooms.value.length === 1 ? selectedRooms.value[0] : null))
const selectedCardRef = ref<HTMLElement | null>(null)

// --- Ajout d'une pièce -------------------------------------------------------

// Une nouvelle pièce démarre neutre (« Nouvelle pièce », catégorie « Autre », 3 × 3 m) : on lui donne
// son nom et sa catégorie ensuite, dans le formulaire de la pièce sélectionnée.
const NEW_ROOM_SIZE = { width: 3, height: 3 }

function addRoom() {
  if (!plan.value) return
  const { width, height } = NEW_ROOM_SIZE
  const maxX = rooms.value.length > 0 ? Math.max(...rooms.value.map((room) => room.center.x + room.width / 2)) : 0
  const room: Room = {
    id: crypto.randomUUID(),
    label: 'Nouvelle pièce',
    category: 'autre',
    center: { x: snapToGrid(maxX + 1 + width / 2), y: snapToGrid(height / 2) },
    width,
    height,
    rotation: 0,
    removedWalls: [],
  }
  planStore.addRoom(props.planId, room)
  emit('update:selectedIds', [room.id])
  emit('refit')
  // Le formulaire de la pièce sélectionnée s'affiche au-dessus de la liste : on l'amène à l'écran pour que
  // l'ajout soit visiblement sélectionné (sans voler le focus, pour que les flèches déplacent la pièce).
  void nextTick(() => selectedCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
}

function deleteSelection() {
  planStore.removeRooms(props.planId, props.selectedIds)
  emit('update:selectedIds', [])
}

function swapRoomDimensions(room: Room) {
  const width = room.width
  room.width = room.height
  room.height = width
}

// --- Murs -----------------------------------------------------------------------

// Épaisseur : un choix global pour tout le plan.
const wallType = computed(() => plan.value?.wallType ?? 'brique-22')

function onWallTypeChange(e: Event) {
  planStore.setWallType(props.planId, (e.target as HTMLSelectElement).value as WallType)
}

// Suppression d'un mur : chaque côté de la pièce est indépendant (pièce ouverte sur ce côté).
// Ordre d'affichage : haut, droite, bas, gauche.
const WALL_EDGES: RoomEdge[] = [2, 1, 0, 3]

function isWallRemoved(room: Room, edge: RoomEdge): boolean {
  return room.removedWalls.includes(edge)
}

function toggleWall(room: Room, edge: RoomEdge) {
  room.removedWalls = isWallRemoved(room, edge)
    ? room.removedWalls.filter((removed) => removed !== edge)
    : [...room.removedWalls, edge]
}

// --- Position du centre (relative à l'origine du plan) -----------------------

const selectedRoomCenter = computed(() => {
  const room = selectedRoom.value
  if (!room) return null
  return {
    x: roundMeters(room.center.x - props.origin.x, 2),
    y: roundMeters(room.center.y - props.origin.y, 2),
  }
})

// Appliqué au `change` (pas à chaque frappe) pour ne pas déplacer la pièce pendant qu'on tape une valeur.
function onRoomCenterChange(axis: 'x' | 'y', e: Event) {
  const room = selectedRoom.value
  const input = e.target as HTMLInputElement
  const value = Number(input.value)
  if (!room || input.value.trim() === '' || Number.isNaN(value)) {
    // Saisie invalide : on remet la valeur courante dans le champ.
    if (selectedRoomCenter.value) input.value = String(selectedRoomCenter.value[axis])
    return
  }
  room.center = { ...room.center, [axis]: value + props.origin[axis] }
}

// --- Portes et fenêtres de la pièce sélectionnée -------------------------------

const OPENING_KIND_LABELS: Partial<Record<OpeningKind, string>> = {
  interior: 'Porte intérieure',
  entrance: "Porte d'entrée",
  window: 'Fenêtre',
}
const OPENING_ADD_BUTTONS: { kind: OpeningKind; label: string }[] = [
  { kind: 'interior', label: '+ Porte' },
  { kind: 'window', label: '+ Fenêtre' },
]

const roomOpenings = computed<RoomOpening[]>(() => {
  const room = selectedRoom.value
  return room ? (plan.value?.roomOpenings ?? []).filter((opening) => opening.roomId === room.id) : []
})

function addOpening(opening: EdgeOpening) {
  const room = selectedRoom.value
  if (room) planStore.addRoomOpening(props.planId, { ...opening, roomId: room.id })
}

// --- Contrôles de placement --------------------------------------------------

const roomErrors = computed(() => {
  const terrain = plan.value?.terrain
  if (!terrain) return []
  return rooms.value.flatMap((room) => validateRoomPlacement(room, rooms.value, terrain))
})

// Les problèmes de placement s'affichent en toasts (un par message, à leur apparition) plutôt qu'en liste fixe.
useValidationToasts(roomErrors)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="rounded-lg border border-gray-200 p-3">
      <h2 class="text-sm font-semibold text-gray-900">Épaisseur des murs</h2>
      <p class="mt-1 text-xs text-gray-500">Un seul choix pour tout le plan.</p>
      <select
        :value="wallType"
        aria-label="Épaisseur des murs"
        class="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
        @change="onWallTypeChange"
      >
        <option v-for="(type, id) in WALL_TYPES" :key="id" :value="id">{{ type.label }}</option>
      </select>
    </div>

    <div v-if="selectedRoom" ref="selectedCardRef" class="rounded-lg border-2 border-yellow-400 p-3">
      <h2 class="text-sm font-semibold text-gray-900">Pièce sélectionnée</h2>

      <div class="mt-2 flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-xs text-gray-600">
          Label
          <input
            v-model="selectedRoom.label"
            type="text"
            class="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </label>
        <label class="flex flex-col gap-1 text-xs text-gray-600">
          Catégorie
          <select
            v-model="selectedRoom.category"
            class="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          >
            <option v-for="(label, value) in CATEGORY_LABELS" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>
        <div class="flex items-end gap-3">
          <label class="flex flex-col gap-1 text-xs text-gray-600">
            Rotation (°)
            <input
              v-model.number="selectedRoom.rotation"
              type="number"
              step="15"
              class="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
          </label>
          <p class="pb-1.5 text-sm text-gray-600">{{ Math.round(roomArea(selectedRoom)) }} m²</p>
        </div>
        <div v-if="selectedRoomCenter" class="flex flex-col gap-1">
          <span class="text-xs text-gray-600">Centre (m)</span>
          <div class="flex items-center gap-1">
            <input
              type="number"
              step="0.5"
              aria-label="Centre X (m)"
              :value="selectedRoomCenter.x"
              class="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-900 focus:outline-none"
              @change="onRoomCenterChange('x', $event)"
            />
            <input
              type="number"
              step="0.5"
              aria-label="Centre Y (m)"
              :value="selectedRoomCenter.y"
              class="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-900 focus:outline-none"
              @change="onRoomCenterChange('y', $event)"
            />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-xs text-gray-600">Dimensions (m)</span>
          <div class="flex flex-wrap items-center gap-1">
            <input
              v-model.number="selectedRoom.width"
              type="number"
              step="0.5"
              min="0.1"
              aria-label="Largeur (m)"
              class="w-16 rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
            />
            <button
              type="button"
              class="px-1 text-gray-500 hover:text-gray-900"
              title="Échanger largeur et hauteur"
              @click="swapRoomDimensions(selectedRoom)"
            >
              ⇄
            </button>
            <input
              v-model.number="selectedRoom.height"
              type="number"
              step="0.5"
              min="0.1"
              aria-label="Hauteur (m)"
              class="w-16 rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
            />
            <span class="text-sm text-gray-600">
              m · {{ Math.round(roomArea(selectedRoom)) }} m²
              <template v-if="selectedRoom.rotation !== 0"> · {{ Math.round(selectedRoom.rotation) }}°</template>
            </span>
          </div>
        </div>
      </div>

      <div class="mt-3 border-t border-gray-200 pt-3">
        <h3 class="text-xs font-semibold text-gray-900">Murs</h3>
        <ul class="mt-2 space-y-1">
          <li v-for="edge in WALL_EDGES" :key="edge" class="flex items-center justify-between gap-2 text-sm">
            <span :class="isWallRemoved(selectedRoom, edge) ? 'text-gray-400 line-through' : 'text-gray-700'">
              Mur {{ ROOM_EDGE_LABELS[edge].toLowerCase() }}
            </span>
            <button
              type="button"
              class="rounded-md border px-2 py-0.5 text-xs"
              :class="
                isWallRemoved(selectedRoom, edge)
                  ? 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  : 'border-red-300 text-red-700 hover:bg-red-50'
              "
              :aria-label="`${isWallRemoved(selectedRoom, edge) ? 'Rétablir' : 'Supprimer'} le mur ${ROOM_EDGE_LABELS[edge].toLowerCase()}`"
              @click="toggleWall(selectedRoom, edge)"
            >
              {{ isWallRemoved(selectedRoom, edge) ? 'Rétablir' : 'Supprimer' }}
            </button>
          </li>
        </ul>
      </div>

      <div class="mt-3 border-t border-gray-200 pt-3">
        <OpeningsEditor
          title="Portes et fenêtres"
          :openings="roomOpenings"
          :edge-length="(edge) => edgeLength(selectedRoom!, edge)"
          :kind-labels="OPENING_KIND_LABELS"
          :add-buttons="OPENING_ADD_BUTTONS"
          empty-text="Aucune porte ni fenêtre dans cette pièce."
          @add="addOpening"
          @remove="planStore.removeRoomOpening(planId, $event)"
        />
      </div>

      <button
        type="button"
        class="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
        @click="deleteSelection"
      >
        Supprimer la pièce
      </button>
    </div>

    <div v-else-if="selectedRooms.length > 1" class="rounded-lg border border-gray-200 p-3">
      <p class="text-sm text-gray-900">
        {{ selectedRooms.length }} pièces sélectionnées
        <span class="text-gray-600">
          · {{ Math.round(selectedRooms.reduce((total, room) => total + roomArea(room), 0)) }} m²
        </span>
      </p>
      <button
        type="button"
        class="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
        @click="deleteSelection"
      >
        Supprimer la sélection
      </button>
    </div>

    <div class="rounded-lg border border-gray-200 p-3">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold text-gray-900">Pièces</h2>
        <button
          type="button"
          class="whitespace-nowrap rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white"
          @click="addRoom"
        >
          + Ajouter
        </button>
      </div>
      <ul class="mt-2 space-y-2 text-sm text-gray-600">
        <li
          v-for="room in rooms"
          :key="room.id"
          class="border-l-4 pl-2"
          :class="selectedIds.includes(room.id) ? 'border-yellow-400' : 'border-transparent'"
        >
          <button
            type="button"
            class="text-left font-medium text-gray-900 hover:underline"
            @click="emit('update:selectedIds', [room.id])"
          >
            {{ room.label }}
          </button>
          <span class="font-normal text-gray-500"> ({{ CATEGORY_LABELS[room.category] }})</span>
          <div class="mt-1 flex flex-wrap items-center gap-1">
            <input
              v-model.number="room.width"
              type="number"
              step="0.5"
              min="0.1"
              class="w-16 rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
            />
            <button
              type="button"
              class="px-1 text-gray-500 hover:text-gray-900"
              title="Échanger largeur et hauteur"
              @click="swapRoomDimensions(room)"
            >
              ⇄
            </button>
            <input
              v-model.number="room.height"
              type="number"
              step="0.5"
              min="0.1"
              class="w-16 rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
            />
            <span>
              m · {{ Math.round(roomArea(room)) }} m²
              <template v-if="room.rotation !== 0"> · {{ Math.round(room.rotation) }}°</template>
            </span>
          </div>
        </li>
        <li v-if="rooms.length === 0" class="text-gray-500">Aucune pièce.</li>
      </ul>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PlanPoint } from '@/shared/types'
import { usePlanStore } from '../../store/plan.store'
import {
  bottomWholeMeterShift,
  computeTerrainFromGps,
  nearestSideIndex,
  parseCoordinatePair,
  parseCoordinateValue,
  nextBottomAlignmentStep,
  regularPolygonTerrain,
  roadAlongSide,
  terrainCentroid,
  terrainSideAngleDeg,
  terrainSideLabel,
  terrainSideLength,
} from '../../terrain/services/terrain.service'
import type { Gate, GateKind } from '../../terrain/types'
import { roundMeters } from '../constants'

const props = defineProps<{
  planId: string
  /** Origine du plan : les positions affichées sont relatives à ce repère (axes visibles sur le canvas). */
  origin: PlanPoint
}>()

const emit = defineEmits<{ refit: [] }>()

const planStore = usePlanStore()
const plan = computed(() => planStore.getPlanById(props.planId))
const terrain = computed(() => plan.value?.terrain ?? null)

// --- Bornes du terrain -------------------------------------------------------

// Positions affichées relatives à l'origine du plan (toujours en bas à gauche), pas les valeurs
// stockées brutes : seules l'échelle et les distances entre blocs comptent, pas une coordonnée absolue.
const terrainVertexList = computed(() => {
  if (!terrain.value) return []
  return terrain.value.vertices.map((vertex, index) => ({
    label: vertex.label ?? `Sommet ${index + 1}`,
    x: roundMeters(vertex.point.x - props.origin.x),
    y: roundMeters(vertex.point.y - props.origin.y),
    lat: vertex.geo ? Math.round(vertex.geo.lat * 1e6) / 1e6 : null,
    lng: vertex.geo ? Math.round(vertex.geo.lng * 1e6) / 1e6 : null,
  }))
})

// Orientation du terrain pilotée par l'angle (axe X) du premier côté (1er sommet → 2e sommet),
// plutôt que par un pas fixe : on calcule l'angle courant, puis on ne pivote que de la différence
// avec l'angle voulu. Le terrain pivote autour de son propre centre ; le repère (axes, grille) ne bouge pas.
const terrainFirstSideLabel = computed(() => {
  const vertices = terrain.value?.vertices ?? []
  if (vertices.length < 2) return ''
  return `${vertices[0].label ?? '1'} → ${vertices[1].label ?? '2'}`
})

const terrainSideAngle = computed(() => {
  const angle = terrain.value ? terrainSideAngleDeg(terrain.value) : null
  return angle === null ? null : Math.round(angle * 10) / 10
})

// Raccourci du champ « Angle » : chaque clic pose EN BAS, à l'horizontale, le côté SUIVANT du terrain (le terrain
// est au-dessus, donc ce sont les bornes du bas qui sont alignées) (voir `nextBottomAlignmentStep`). Le champ affiche toujours l'angle du premier côté.
// Après la rotation, on recale le terrain verticalement pour que ses bornes les plus basses aient un y entier
// (mesuré depuis l'origine affichée dans la liste des bornes) : le terrain glisse d'au plus 0,5 m.
function rotateToNextBottomSide(direction: 'left' | 'right') {
  const step = terrain.value ? nextBottomAlignmentStep(terrain.value, direction) : null
  if (!step || step.deltaDeg === 0) return

  planStore.rotateTerrain(props.planId, step.deltaDeg)
  const rotated = terrain.value
  if (!rotated) return
  const shift = bottomWholeMeterShift(rotated, props.origin.y)
  if (shift !== 0) planStore.moveTerrain(props.planId, { x: 0, y: shift })
}

// Côté que le prochain clic posera en bas, pour l'infobulle des boutons.
function nextBottomSideLabel(direction: 'left' | 'right'): string {
  const step = terrain.value ? nextBottomAlignmentStep(terrain.value, direction) : null
  return step && terrain.value ? terrainSideLabel(terrain.value, step.sideIndex) : ''
}

function onTerrainAngleChange(e: Event) {
  const targetAngle = Number((e.target as HTMLInputElement).value)
  if (Number.isNaN(targetAngle) || terrainSideAngle.value === null) return
  planStore.rotateTerrain(props.planId, targetAngle - terrainSideAngle.value)
}

// Centre du terrain affiché en absolu (PAS relatif à l'origine du cadrage) : c'est la position brute
// dans le repère du plan, que l'on modifie en tapant une nouvelle valeur (le terrain se déplace de la différence).
const terrainCenter = computed(() => {
  if (!terrain.value) return null
  const centroid = terrainCentroid(terrain.value)
  return { x: roundMeters(centroid.x), y: roundMeters(centroid.y) }
})

function onTerrainCenterChange(axis: 'x' | 'y', e: Event) {
  if (!terrainCenter.value) return
  const target = Number((e.target as HTMLInputElement).value)
  if (Number.isNaN(target)) return
  const delta: PlanPoint =
    axis === 'x' ? { x: target - terrainCenter.value.x, y: 0 } : { x: 0, y: target - terrainCenter.value.y }
  planStore.moveTerrain(props.planId, delta)
}

// --- Réinitialisation du terrain via des coordonnées GPS (carte) -----------

interface GpsVertexInput {
  label: string
  lat: string
  lng: string
}

const showGpsForm = ref(false)
const gpsForm = ref<GpsVertexInput[]>([])
const gpsFormError = ref<string | null>(null)

function openGpsForm() {
  const vertices = terrain.value?.vertices ?? []
  gpsForm.value =
    vertices.length > 0
      ? vertices.map((vertex, index) => ({
          label: vertex.label ?? `Sommet ${index + 1}`,
          lat: vertex.geo ? String(vertex.geo.lat) : '',
          lng: vertex.geo ? String(vertex.geo.lng) : '',
        }))
      : [
          { label: 'Sommet 1', lat: '', lng: '' },
          { label: 'Sommet 2', lat: '', lng: '' },
          { label: 'Sommet 3', lat: '', lng: '' },
        ]
  gpsFormError.value = null
  showGpsForm.value = true
}

function addGpsVertexRow() {
  gpsForm.value.push({ label: `Sommet ${gpsForm.value.length + 1}`, lat: '', lng: '' })
}

function removeGpsVertexRow(index: number) {
  gpsForm.value.splice(index, 1)
}

// Accepte le décimal (-18.8792) et le DMS (18°56'32.9"S) — y compris en collant la paire complète
// telle qu'affichée par Google Maps ("18°56'32.9\"S 47°36'52.5\"E") dans un seul des deux champs.
function onCoordinatePaste(row: GpsVertexInput, field: 'lat' | 'lng', event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? ''
  const pair = parseCoordinatePair(text)
  if (pair) {
    event.preventDefault()
    row.lat = String(pair.lat)
    row.lng = String(pair.lng)
    return
  }

  const single = parseCoordinateValue(text)
  if (single !== null) {
    event.preventDefault()
    row[field] = String(single)
  }
}

// Filet de sécurité si la saisie est tapée/collée sans passer par onCoordinatePaste (ex: DMS tapé à la main).
function normalizeCoordinateField(row: GpsVertexInput, field: 'lat' | 'lng') {
  if (row[field].includes('°')) {
    const value = parseCoordinateValue(row[field])
    if (value !== null) row[field] = String(value)
  }
}

function confirmGpsReset() {
  gpsFormError.value = null

  if (gpsForm.value.length < 3) {
    gpsFormError.value = 'Un terrain nécessite au moins 3 sommets.'
    return
  }

  const parsed: { label?: string; geo: { lat: number; lng: number } }[] = []
  for (const row of gpsForm.value) {
    const lat = parseCoordinateValue(row.lat)
    const lng = parseCoordinateValue(row.lng)
    if (lat === null || lng === null) {
      gpsFormError.value = `Coordonnées invalides pour "${row.label}".`
      return
    }
    parsed.push({ label: row.label || undefined, geo: { lat, lng } })
  }

  const previous = terrain.value
  const newTerrain = computeTerrainFromGps(parsed)
  if (previous) {
    // La route est un objet indépendant du terrain : on la garde telle quelle.
    newTerrain.road = previous.road
    // La clôture et les portes d'entrée sont repérées par numéro de côté : on les garde si le nombre
    // de sommets n'a pas changé, sinon les numéros ne correspondraient plus aux mêmes côtés.
    if (previous.vertices.length === newTerrain.vertices.length) {
      newTerrain.fenced = previous.fenced
      newTerrain.gates = previous.gates
    }
  }
  planStore.setTerrain(props.planId, newTerrain)
  emit('refit')
  showGpsForm.value = false
}

// --- Pose manuelle des bornes (sans carte) ----------------------------------
// Poser directement un polygone régulier par défaut (carré, pentagone, hexagone...) sur le canvas,
// que l'utilisateur affine ensuite en glissant chaque borne (les poignées de sommets existent déjà
// à l'étape terrain — voir StructureEditorView).

/** Rayon (m) du polygone par défaut : pour un carré, un côté d'environ 10 m. */
const MANUAL_DEFAULT_RADIUS = 7

const MANUAL_SHAPE_PRESETS = [
  { sides: 3, label: 'Triangle' },
  { sides: 4, label: 'Carré' },
  { sides: 5, label: 'Pentagone' },
  { sides: 6, label: 'Hexagone' },
]

const showManualForm = ref(false)
const manualSides = ref(4)
const manualFormError = ref<string | null>(null)

function openManualForm() {
  manualSides.value = terrain.value?.vertices.length ?? 4
  manualFormError.value = null
  showManualForm.value = true
}

function confirmManualPlacement() {
  const sides = Math.round(manualSides.value)
  if (!Number.isFinite(sides) || sides < 3) {
    manualFormError.value = 'Un terrain nécessite au moins 3 sommets.'
    return
  }

  const previous = terrain.value
  const center = previous ? terrainCentroid(previous) : { x: props.origin.x + MANUAL_DEFAULT_RADIUS, y: props.origin.y + MANUAL_DEFAULT_RADIUS }
  const newTerrain = regularPolygonTerrain(sides, center, MANUAL_DEFAULT_RADIUS)
  if (previous) {
    newTerrain.road = previous.road
    // Numéros de côté : ne les garder que si le nombre de sommets n'a pas changé (voir confirmGpsReset).
    if (previous.vertices.length === newTerrain.vertices.length) {
      newTerrain.fenced = previous.fenced
      newTerrain.gates = previous.gates
    }
  }
  planStore.setTerrain(props.planId, newTerrain)
  emit('refit')
  showManualForm.value = false
}

// --- Périphérie : route, clôture, portes d'entrée --------------------------

const sideOptions = computed(() => {
  const current = terrain.value
  if (!current) return []
  return current.vertices.map((_, index) => ({
    index,
    label: `${terrainSideLabel(current, index)} (${roundMeters(terrainSideLength(current, index))} m)`,
  }))
})

const road = computed(() => terrain.value?.road ?? null)

// Poser ou réaligner la route le long d'un côté du terrain : point de départ que l'on ajuste ensuite
// (position, angle, dimensions) — la route reste libre après coup.
function onAlignRoad(e: Event) {
  const select = e.target as HTMLSelectElement
  const raw = select.value
  select.value = '' // le sélecteur est une action, pas un état : il revient sur son intitulé
  if (raw === '' || !terrain.value) return
  planStore.setRoad(props.planId, roadAlongSide(terrain.value, Number(raw)))
  emit('refit') // la route peut sortir du cadrage courant
}

function removeRoad() {
  planStore.setRoad(props.planId, null)
}

// Centre de la route affiché relativement à l'origine du plan, comme les sommets ; appliqué au `change`
// (pas à chaque frappe) pour ne pas déplacer la route pendant qu'on tape une valeur.
const roadCenter = computed(() => {
  if (!road.value) return null
  return {
    x: roundMeters(road.value.center.x - props.origin.x, 2),
    y: roundMeters(road.value.center.y - props.origin.y, 2),
  }
})

function onRoadCenterChange(axis: 'x' | 'y', e: Event) {
  const current = road.value
  const input = e.target as HTMLInputElement
  const value = Number(input.value)
  if (!current || input.value.trim() === '' || Number.isNaN(value)) {
    if (roadCenter.value) input.value = String(roadCenter.value[axis]) // saisie invalide : valeur courante
    return
  }
  current.center = { ...current.center, [axis]: value + props.origin[axis] }
}

const GATE_KIND_LABELS: Record<GateKind, string> = { pedestrian: 'Portillon', vehicle: 'Portail' }
const GATE_DEFAULT_WIDTH: Record<GateKind, number> = { pedestrian: 1, vehicle: 3 }

const gates = computed<Gate[]>(() => terrain.value?.gates ?? [])

function addGate() {
  const current = terrain.value
  if (!current) return
  // Une porte d'entrée donne le plus souvent sur la route : on démarre sur le côté qui lui fait face.
  const sideIndex = current.road ? nearestSideIndex(current, current.road.center) : 0
  const width = GATE_DEFAULT_WIDTH.pedestrian
  planStore.addGate(props.planId, {
    id: crypto.randomUUID(),
    sideIndex,
    offset: Math.max((terrainSideLength(current, sideIndex) - width) / 2, 0),
    width,
    kind: 'pedestrian',
  })
}

// Changer le type propose la largeur habituelle de ce type (portillon 1 m, portail 3 m).
function onGateKindChange(gate: Gate, e: Event) {
  gate.kind = (e.target as HTMLSelectElement).value as GateKind
  gate.width = GATE_DEFAULT_WIDTH[gate.kind]
}

function onFencedChange(e: Event) {
  planStore.setFenced(props.planId, (e.target as HTMLInputElement).checked)
}
</script>

<template>
  <div v-if="terrain" class="flex flex-col gap-4">
    <div class="rounded-lg border border-gray-200 p-3">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold text-gray-900">Bornes du terrain</h2>
        <div class="flex items-center gap-2">
          <button type="button" class="whitespace-nowrap text-xs font-medium text-gray-900 underline" @click="openManualForm">
            Poser manuellement
          </button>
          <button type="button" class="whitespace-nowrap text-xs font-medium text-gray-900 underline" @click="openGpsForm">
            Réinitialiser via carte
          </button>
        </div>
      </div>

      <ul class="mt-2 space-y-1 text-sm text-gray-600">
        <li v-for="vertex in terrainVertexList" :key="vertex.label" class="flex justify-between gap-2">
          <span class="font-medium text-gray-900">{{ vertex.label }}</span>
          <span class="text-right">
            x: {{ vertex.x }} m · y: {{ vertex.y }} m
            <br v-if="vertex.lat !== null" />
            <span v-if="vertex.lat !== null" class="text-xs text-gray-400">
              lat {{ vertex.lat }} · lng {{ vertex.lng }}
            </span>
          </span>
        </li>
      </ul>

      <div v-if="terrainSideAngle !== null" class="mt-3 flex items-center justify-between gap-2 border-t border-gray-200 pt-3">
        <label class="text-xs text-gray-600" for="terrain-side-angle">Angle {{ terrainFirstSideLabel }}</label>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
            :title="`Pivoter à gauche : poser ${nextBottomSideLabel('left')} en bas, à l'horizontale`"
            aria-label="Pivoter à gauche : poser le côté suivant en bas, à l'horizontale"
            @click="rotateToNextBottomSide('left')"
          >
            ↺
          </button>
          <input
            id="terrain-side-angle"
            type="number"
            step="1"
            :value="terrainSideAngle"
            class="w-20 rounded-md border border-gray-300 px-2 py-1 text-center text-xs focus:border-gray-900 focus:outline-none"
            @change="onTerrainAngleChange"
          />
          <button
            type="button"
            class="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
            :title="`Pivoter à droite : poser ${nextBottomSideLabel('right')} en bas, à l'horizontale`"
            aria-label="Pivoter à droite : poser le côté précédent en bas, à l'horizontale"
            @click="rotateToNextBottomSide('right')"
          >
            ↻
          </button>
        </div>
      </div>

      <div v-if="terrainCenter" class="mt-3 flex items-center justify-between gap-2 border-t border-gray-200 pt-3">
        <label class="text-xs text-gray-600">Centre du terrain (m)</label>
        <div class="flex items-center gap-1">
          <input
            type="number"
            step="0.5"
            :value="terrainCenter.x"
            class="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-gray-900 focus:outline-none"
            @change="onTerrainCenterChange('x', $event)"
          />
          <input
            type="number"
            step="0.5"
            :value="terrainCenter.y"
            class="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-gray-900 focus:outline-none"
            @change="onTerrainCenterChange('y', $event)"
          />
        </div>
      </div>
    </div>

    <div class="rounded-lg border border-gray-200 p-3">
      <h2 class="text-sm font-semibold text-gray-900">Route</h2>

      <template v-if="road">
        <div class="mt-3 grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1 text-xs text-gray-600">
            Centre X (m)
            <input
              type="number"
              step="0.5"
              :value="roadCenter?.x"
              class="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              @change="onRoadCenterChange('x', $event)"
            />
          </label>
          <label class="flex flex-col gap-1 text-xs text-gray-600">
            Centre Y (m)
            <input
              type="number"
              step="0.5"
              :value="roadCenter?.y"
              class="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              @change="onRoadCenterChange('y', $event)"
            />
          </label>
          <label class="flex flex-col gap-1 text-xs text-gray-600">
            Angle (°)
            <input
              v-model.number="road.rotation"
              type="number"
              step="1"
              class="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
          </label>
          <span />
          <label class="flex flex-col gap-1 text-xs text-gray-600">
            Longueur (m)
            <input
              v-model.number="road.length"
              type="number"
              step="0.5"
              min="0.5"
              class="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
          </label>
          <label class="flex flex-col gap-1 text-xs text-gray-600">
            Largeur (m)
            <input
              v-model.number="road.width"
              type="number"
              step="0.5"
              min="0.5"
              class="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            />
          </label>
        </div>
        <p class="mt-2 text-xs text-gray-500">
          Clique la route sur le canvas pour la glisser, la pivoter ou la redimensionner (flèches : Maj = 1 m).
        </p>
      </template>

      <div class="mt-3 flex items-center gap-2">
        <select
          value=""
          :aria-label="road ? 'Réaligner la route sur un côté' : 'Poser la route le long d’un côté'"
          class="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
          @change="onAlignRoad"
        >
          <option value="">{{ road ? 'Réaligner sur un côté…' : 'Poser le long d’un côté…' }}</option>
          <option v-for="side in sideOptions" :key="side.index" :value="side.index">{{ side.label }}</option>
        </select>
        <button
          v-if="road"
          type="button"
          class="whitespace-nowrap rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          @click="removeRoad"
        >
          Supprimer
        </button>
      </div>
    </div>

    <div class="rounded-lg border border-gray-200 p-3">
      <h2 class="text-sm font-semibold text-gray-900">Clôture</h2>
      <label class="mt-2 flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" :checked="terrain.fenced ?? false" @change="onFencedChange" />
        Clôturer tout le terrain
      </label>
    </div>

    <div class="rounded-lg border border-gray-200 p-3">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold text-gray-900">Portes d'entrée</h2>
        <button type="button" class="whitespace-nowrap text-xs font-medium text-gray-900 underline" @click="addGate">
          + Ajouter
        </button>
      </div>

      <ul class="mt-2 space-y-3">
        <li v-for="(gate, index) in gates" :key="gate.id" class="space-y-1 rounded-md border border-gray-200 p-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-gray-900">Porte {{ index + 1 }}</span>
            <button
              type="button"
              class="text-xs text-red-600 hover:text-red-700"
              :aria-label="`Supprimer la porte ${index + 1}`"
              @click="planStore.removeGate(planId, gate.id)"
            >
              ✕
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-1">
            <select
              v-model.number="gate.sideIndex"
              aria-label="Côté"
              class="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
            >
              <option v-for="side in sideOptions" :key="side.index" :value="side.index">{{ side.label }}</option>
            </select>
            <select
              :value="gate.kind"
              aria-label="Type"
              class="rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
              @change="onGateKindChange(gate, $event)"
            >
              <option v-for="(label, kind) in GATE_KIND_LABELS" :key="kind" :value="kind">{{ label }}</option>
            </select>
          </div>
          <div class="flex items-center gap-2 text-xs text-gray-600">
            <label class="flex items-center gap-1">
              Position
              <input
                v-model.number="gate.offset"
                type="number"
                step="0.5"
                min="0"
                class="w-16 rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
              />
            </label>
            <label class="flex items-center gap-1">
              Largeur
              <input
                v-model.number="gate.width"
                type="number"
                step="0.5"
                min="0.5"
                class="w-16 rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
              />
            </label>
            <span>m</span>
          </div>
        </li>
        <li v-if="gates.length === 0" class="text-xs text-gray-500">Aucune porte d'entrée.</li>
      </ul>
    </div>
  </div>

  <!-- Atelier vide : on crée le terrain avec la même saisie de coordonnées GPS que pour le réinitialiser. -->
  <div v-else class="rounded-lg border border-gray-200 p-3">
    <h2 class="text-sm font-semibold text-gray-900">Terrain</h2>
    <div class="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
        @click="openGpsForm"
      >
        Définir le terrain via carte
      </button>
      <button
        type="button"
        class="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        @click="openManualForm"
      >
        Poser les bornes manuellement
      </button>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="showGpsForm"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="showGpsForm = false"
    >
      <div class="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-900">
          {{ terrain ? 'Réinitialiser le terrain via carte' : 'Définir le terrain via carte' }}
        </h3>
          <button type="button" class="text-gray-400 hover:text-gray-600" aria-label="Fermer" @click="showGpsForm = false">
            ✕
          </button>
        </div>

        <div class="mt-3 space-y-3">
          <div v-for="(row, index) in gpsForm" :key="index" class="space-y-1 rounded-md border border-gray-200 p-2">
            <div class="flex items-center gap-1">
              <input
                v-model="row.label"
                type="text"
                placeholder="Label"
                class="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
              />
              <button
                type="button"
                class="shrink-0 text-xs text-red-600 hover:text-red-700"
                :disabled="gpsForm.length <= 3"
                :class="{ 'opacity-30': gpsForm.length <= 3 }"
                @click="removeGpsVertexRow(index)"
              >
                ✕
              </button>
            </div>
            <div class="flex items-center gap-1">
              <input
                v-model="row.lat"
                type="text"
                inputmode="decimal"
                placeholder="Latitude (ou 18°56'32.9&quot;S)"
                class="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
                @paste="onCoordinatePaste(row, 'lat', $event)"
                @blur="normalizeCoordinateField(row, 'lat')"
              />
              <input
                v-model="row.lng"
                type="text"
                inputmode="decimal"
                placeholder="Longitude"
                class="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-1 text-xs focus:border-gray-900 focus:outline-none"
                @paste="onCoordinatePaste(row, 'lng', $event)"
                @blur="normalizeCoordinateField(row, 'lng')"
              />
            </div>
          </div>

          <button type="button" class="text-xs font-medium text-gray-900 underline" @click="addGpsVertexRow">
            + Ajouter un sommet
          </button>

          <p v-if="gpsFormError" class="text-xs text-red-600">{{ gpsFormError }}</p>

          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              @click="showGpsForm = false"
            >
              Annuler
            </button>
            <button type="button" class="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white" @click="confirmGpsReset">
              {{ terrain ? 'Réinitialiser le terrain' : 'Créer le terrain' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="showManualForm"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="showManualForm = false"
    >
      <div class="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-900">Poser les bornes manuellement</h3>
          <button type="button" class="text-gray-400 hover:text-gray-600" aria-label="Fermer" @click="showManualForm = false">
            ✕
          </button>
        </div>

        <p class="mt-2 text-xs text-gray-500">
          Une forme par défaut est posée sur le plan ; glisse ensuite chaque borne sur le canvas pour l'ajuster.
        </p>

        <div class="mt-3 flex flex-wrap gap-1.5">
          <button
            v-for="preset in MANUAL_SHAPE_PRESETS"
            :key="preset.sides"
            type="button"
            class="rounded-md border px-2 py-1 text-xs"
            :class="
              manualSides === preset.sides
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            "
            @click="manualSides = preset.sides"
          >
            {{ preset.label }} ({{ preset.sides }})
          </button>
        </div>

        <label class="mt-3 flex items-center justify-between gap-2 text-xs text-gray-600">
          Nombre de sommets
          <input
            v-model.number="manualSides"
            type="number"
            min="3"
            max="20"
            step="1"
            class="w-16 rounded-md border border-gray-300 px-2 py-1 text-center text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </label>

        <p v-if="manualFormError" class="mt-2 text-xs text-red-600">{{ manualFormError }}</p>

        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            @click="showManualForm = false"
          >
            Annuler
          </button>
          <button type="button" class="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white" @click="confirmManualPlacement">
            {{ terrain ? 'Remplacer le terrain' : 'Poser le terrain' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

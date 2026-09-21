<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { AUTOSAVE_DELAY_MS, useAutosave } from '@/shared/composables/useAutosave'
import { useToasts } from '@/shared/composables/useToasts'
import type { PlanPoint } from '@/shared/types'
import { usePlanStore } from '../../store/plan.store'
import { serializePlan } from '../../services/plan.snapshot'
import {
  fenceSegments,
  gateSegment,
  terrainArea,
  terrainNorthAngle,
  terrainSideOutwardNormal,
} from '../../terrain/services/terrain.service'
import ExportMenu, { type ExportFormat } from '../components/ExportMenu.vue'
import HouseStepPanel from '../components/HouseStepPanel.vue'
import RoomsStepPanel from '../components/RoomsStepPanel.vue'
import StepperNav from '../components/StepperNav.vue'
import TerrainStepPanel from '../components/TerrainStepPanel.vue'
import { CATEGORY_COLORS, STRUCTURE_STEPS, WALL_TYPES, roundMeters, type StructureStepId } from '../constants'
import {
  GRID_STEP,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  snapToGrid,
  usePlanViewport,
} from '../composables/usePlanViewport'
import {
  dataUrlToBytes,
  downloadBlob,
  downloadUrl,
  exportFileBase,
  jpegToPdf,
  planToExportJson,
} from '../services/export.service'
import {
  clampHouseMoveToTerrain,
  clampRoomsMoveToHouse,
  houseOpeningSegment,
  roomEdgeSegment,
  roomOpeningSegment,
  roomWallSegments,
} from '../services/structure.service'
import type { OpeningKind, Room, RoomEdge } from '../types'

const props = defineProps<{ planId: string }>()

const planStore = usePlanStore()

const plan = computed(() => planStore.getPlanById(props.planId))

// Le plan vient de Supabase : il peut ne pas être là au premier affichage (rechargement de la page, lien direct).
// `ensurePlan` le charge ; tant qu'il n'est pas arrivé, on affiche un état de chargement plutôt qu'un faux « introuvable ».
// --- Enregistrement ------------------------------------------------------------
// Le plan est modifié en mémoire ; « Enregistrer » l'écrit en base (une transaction : tout ou rien). L'état
// « modifié » se déduit en comparant le plan à son contenu au dernier enregistrement. Sans action de ta part, il
// est aussi enregistré automatiquement après une période d'inactivité (`AUTOSAVE_DELAY_MS`, voir `useAutosave`).

const toasts = useToasts()
const isDirty = computed(() => planStore.isDirty(props.planId))
const isSaving = computed(() => planStore.isSaving(props.planId))

// --- Mode « Tout déplacer » --------------------------------------------------------
// Un clic sur le bouton active le mode (curseur en main) : on fait alors glisser TOUT le contenu d'un bloc, à la
// souris ou aux flèches, dans le repère qui reste fixe. Un nouveau clic sur le bouton (ou Échap) quitte le mode.
// Le cadrage ne change pas non plus : « Recadrer la vue » ramène le contenu à l'écran s'il en est sorti.
const moveAllMode = ref(false)
const isPanning = ref(false)

const hasContent = computed(() => {
  const current = plan.value
  return !!current && (!!current.terrain || !!current.house || current.rooms.length > 0)
})

function toggleMoveAll() {
  moveAllMode.value = !moveAllMode.value
  // Pas de sélection pendant le mode : plus rien n'est surligné ni pourvu de poignées.
  if (moveAllMode.value) {
    selectedRoomIds.value = []
    roadSelected.value = false
    terrainSelected.value = false
  }
}

/**
 * Enregistre le plan. Renvoie `true` si c'est fait. Une notification confirme un enregistrement demandé (bouton,
 * Ctrl/Cmd + S) ; l'enregistrement automatique reste silencieux quand il réussit — le bouton suffit à le montrer —
 * mais signale ses échecs, qui restent affichés jusqu'à ce qu'on les ferme.
 */
async function save({ automatic = false } = {}): Promise<boolean> {
  if (!plan.value || !isDirty.value || isSaving.value) return false
  try {
    await planStore.savePlan(props.planId)
    if (!automatic) toasts.push('Atelier enregistré.', { variant: 'success', durationMs: 3000 })
    return true
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Impossible d'enregistrer l'atelier."
    toasts.push(automatic ? `Enregistrement automatique échoué. ${reason}` : reason, { variant: 'error', durationMs: 0 })
    return false
  }
}

// Enregistrement automatique après `AUTOSAVE_DELAY_MS` sans modification. Le signal de changement est le contenu sérialisé du plan :
// il varie à chaque modification réelle (et plus quand on remet une pièce à sa place), pas à chaque clic.
useAutosave({
  changeSignal: () => (plan.value ? serializePlan(plan.value) : null),
  isDirty: () => isDirty.value,
  isSaving: () => isSaving.value,
  save: () => save({ automatic: true }),
})

// L'indicateur de chargement du bouton reste visible au moins 0,7 s : un enregistrement dure souvent moins d'une
// demi-seconde, et sans ce minimum il clignoterait sans qu'on ait le temps de le voir.
const MIN_SPINNER_MS = 700
const isSpinnerVisible = ref(false)
let spinnerShownAt = 0
let spinnerTimer: ReturnType<typeof setTimeout> | undefined

watch(isSaving, (saving) => {
  clearTimeout(spinnerTimer)
  if (saving) {
    isSpinnerVisible.value = true
    spinnerShownAt = Date.now()
  } else {
    const remaining = Math.max(0, MIN_SPINNER_MS - (Date.now() - spinnerShownAt))
    spinnerTimer = setTimeout(() => (isSpinnerVisible.value = false), remaining)
  }
})
onBeforeUnmount(() => clearTimeout(spinnerTimer))

// Quitter avec des modifications non enregistrées les perdrait : on demande confirmation, que ce soit en
// fermant l'onglet/rechargeant (beforeunload) ou en naviguant dans l'application (retour à la liste, déconnexion…).
// Changer d'étape ne quitte pas la page (seul `?step=` change) : pas de question dans ce cas.
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => {
  if (!isDirty.value) return true
  return window.confirm('Des modifications ne sont pas enregistrées. Quitter sans enregistrer ?')
})

const isLoadingPlan = computed(() => !plan.value && (planStore.status === 'idle' || planStore.status === 'loading'))
watch(() => props.planId, (planId) => void planStore.ensurePlan(planId), { immediate: true })

// --- Étapes ------------------------------------------------------------------
// L'étape courante vit dans l'URL (?step=terrain|base|pieces) : lien partageable, bouton retour, rechargement.

const route = useRoute()
const router = useRouter()

const step = computed<StructureStepId>(() => STRUCTURE_STEPS.find((s) => s.id === route.query.step)?.id ?? 'terrain')

function goToStep(id: StructureStepId) {
  void router.push({ query: { ...route.query, step: id } })
}

// --- Repère plan (mètres) <-> pixels du canvas ---------------------------

const { scale, originPoint, toCanvas, toPlan, gridLines, refitView, getViewFrame, setViewFrame } = usePlanViewport(plan)

// Le cadrage se calcule sur le contenu du plan : on le refait quand on change de plan ET quand le plan arrive
// (au premier affichage il n'est pas encore chargé, le cadrage a été calculé sur un plan vide).
watch([() => props.planId, () => plan.value?.id], () => refitView())

// --- Rendu : route (étape 1) --------------------------------------------------
// La route est un rectangle libre (centre, longueur, largeur, rotation) : on la clique pour la sélectionner,
// puis on la glisse / pivote / redimensionne comme la base de la maison.

// Export : `showAll` affiche tout le plan à pleine opacité, sans sélection ni poignées (voir `exportPng`).
const showAll = ref(false)

const roadEditable = computed(() => step.value === 'terrain')
const roadEmphasised = computed(() => showAll.value || roadEditable.value)
const roadSelected = ref(false)
// Le terrain entier est aussi sélectionnable à l'étape 1 (clic ou glisser) : flèches = déplacement, liseré jaune.
const terrainSelected = ref(false)

function selectRoad() {
  roadSelected.value = true
  terrainSelected.value = false
}

function selectTerrain() {
  terrainSelected.value = true
  roadSelected.value = false
}
const ROAD_NODE_ID = 'road-rect'

function roadRectConfig() {
  const road = plan.value?.terrain?.road
  if (!road) return null
  const center = toCanvas(road.center)
  const width = road.length * scale.value
  const height = road.width * scale.value
  const isSelected = roadEditable.value && roadSelected.value && !showAll.value
  return {
    id: ROAD_NODE_ID,
    x: center.x,
    y: center.y,
    offsetX: width / 2,
    offsetY: height / 2,
    width,
    height,
    rotation: -road.rotation, // Konva compte l'angle dans le sens horaire, le modèle dans le sens trigonométrique
    fill: '#3f3f46',
    stroke: isSelected ? '#facc15' : '#71717a',
    strokeWidth: isSelected ? 3 : 1,
    opacity: roadEmphasised.value ? 1 : 0.6,
    draggable: roadEditable.value && !moveAllMode.value,
    listening: roadEditable.value && !moveAllMode.value,
  }
}

// Le label reste horizontal (non pivoté) pour rester lisible quelle que soit l'orientation de la route.
const roadLabelConfig = computed(() => {
  const road = plan.value?.terrain?.road
  if (!road) return null
  const center = toCanvas(road.center)
  return {
    x: center.x - 30,
    y: center.y - 7,
    width: 60,
    align: 'center' as const,
    text: 'Route',
    fill: '#e4e4e7',
    fontSize: 13,
    fontStyle: 'bold',
    opacity: roadEmphasised.value ? 1 : 0.6,
    listening: false,
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onRoadDragEnd(e: any) {
  const road = plan.value?.terrain?.road
  if (!road) return
  const center = toPlan({ x: e.target.x(), y: e.target.y() })
  road.center = { x: snapToGrid(center.x), y: snapToGrid(center.y) }
  // Recale le nœud sur le modèle : si le déplacement s'aligne sur la même case de grille, la config
  // ne change pas et Konva laisserait le nœud là où on l'a lâché.
  e.target.position(toCanvas(road.center))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onRoadTransformEnd(e: any) {
  const road = plan.value?.terrain?.road
  if (!road) return
  const node = e.target
  const lengthPx = node.width() * node.scaleX()
  const widthPx = node.height() * node.scaleY()
  node.scaleX(1)
  node.scaleY(1)

  const center = toPlan({ x: node.x(), y: node.y() })
  road.center = { x: snapToGrid(center.x), y: snapToGrid(center.y) }
  road.length = Math.max(snapToGrid(lengthPx / scale.value), GRID_STEP)
  road.width = Math.max(snapToGrid(widthPx / scale.value), GRID_STEP)
  road.rotation = Math.round(-node.rotation()) + 0 // + 0 : évite -0
}

// --- Rendu : terrain -------------------------------------------------------

const stageConfig = { width: STAGE_WIDTH, height: STAGE_HEIGHT }

// À l'étape 1 le polygone se clique et se glisse (déplacement du terrain entier) ; aux autres étapes il ne
// « écoute » pas : cliquer dessus revient à cliquer dans le vide, donc désélectionne.
const terrainEditable = computed(() => step.value === 'terrain')

const terrainLineConfig = computed(() => {
  if (!plan.value?.terrain) return null
  const points = plan.value.terrain.vertices.flatMap((vertex) => {
    const c = toCanvas(vertex.point)
    return [c.x, c.y]
  })
  const isSelected = terrainEditable.value && terrainSelected.value && !showAll.value
  return {
    points,
    closed: true,
    fill: 'rgba(58, 92, 51, 0.55)',
    stroke: isSelected ? '#facc15' : '#8fce4f',
    strokeWidth: isSelected ? 3 : 2,
    draggable: terrainEditable.value && !moveAllMode.value,
    listening: terrainEditable.value && !moveAllMode.value,
  }
})

// Glisser le polygone déplace TOUT le terrain (bornes et repères) : le nœud Konva, lui, ne fait que se décaler
// de (dx, dy) pixels, alors que ses points sont recalculés depuis les bornes — on convertit ce décalage en mètres
// (axe Y inversé), aligné sur la grille, on l'applique au modèle, puis on remet le nœud à l'origine.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onTerrainDragEnd(e: any) {
  const node = e.target
  const delta = { x: snapToGrid(node.x() / scale.value), y: snapToGrid(-node.y() / scale.value) }
  node.position({ x: 0, y: 0 })
  if (delta.x !== 0 || delta.y !== 0) planStore.moveTerrain(props.planId, delta)
}

const terrainLabels = computed(() => {
  if (!plan.value?.terrain) return []
  return plan.value.terrain.vertices
    .filter((vertex) => vertex.label)
    .map((vertex) => ({ ...toCanvas(vertex.point), label: vertex.label as string }))
})

const terrainVertexHandles = computed(() => {
  if (!plan.value?.terrain) return []
  return plan.value.terrain.vertices.map((vertex, index) => ({
    index,
    key: vertex.label ?? `vertex-${index}`,
    ...toCanvas(vertex.point),
  }))
})

function terrainVertexConfig(x: number, y: number) {
  return { x, y, radius: 7, fill: '#facc15', stroke: '#101014', strokeWidth: 1, draggable: true }
}

// Mise à jour uniquement à la fin du drag (pas en continu) : muter le modèle pendant le drag
// ferait re-rendre le nœud pendant qu'on le tient et le ferait "sauter".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onTerrainVertexDragEnd(index: number, e: any) {
  if (!plan.value?.terrain) return
  const node = e.target
  const point = toPlan({ x: node.x(), y: node.y() })
  plan.value.terrain.vertices[index].point = { x: snapToGrid(point.x), y: snapToGrid(point.y) }
}

// Clôture : tout le périmètre, avec un vide au niveau des portes d'entrée.
const fenceLines = computed(() => {
  const terrain = plan.value?.terrain
  if (!terrain?.fenced) return []
  return fenceSegments(terrain).map((segment, index) => {
    const a = toCanvas(segment.start)
    const b = toCanvas(segment.end)
    return {
      key: `fence-${index}`,
      config: { points: [a.x, a.y, b.x, b.y], stroke: '#e5e7eb', strokeWidth: 3, dash: [8, 5], listening: false },
    }
  })
})

const gateShapes = computed(() => {
  const terrain = plan.value?.terrain
  if (!terrain) return []
  return (terrain.gates ?? []).flatMap((gate, index) => {
    const segment = gateSegment(terrain, gate)
    if (!segment) return []
    const a = toCanvas(segment.start)
    const b = toCanvas(segment.end)
    const normal = terrainSideOutwardNormal(terrain, gate.sideIndex)
    // Étiquette déportée vers l'extérieur du terrain (l'axe Y écran est inversé).
    const labelX = (a.x + b.x) / 2 + normal.x * 18
    const labelY = (a.y + b.y) / 2 - normal.y * 18
    return [
      {
        key: gate.id,
        line: {
          points: [a.x, a.y, b.x, b.y],
          stroke: gate.kind === 'vehicle' ? '#22d3ee' : '#f59e0b',
          strokeWidth: 6,
          lineCap: 'butt',
          listening: false,
        },
        label: {
          x: labelX - 24,
          y: labelY - 7,
          width: 48,
          align: 'center' as const,
          text: `Porte ${index + 1}`,
          fill: '#fde68a',
          fontSize: 11,
          fontStyle: 'bold',
          listening: false,
        },
      },
    ]
  })
})

// --- Boussole (coin haut-gauche du canvas, fixe à l'écran) -------------------
// En haut à gauche car le canvas fait 900 px de large fixes : sur un conteneur plus étroit,
// le coin droit est rogné par `overflow-hidden`.

const COMPASS_RADIUS = 34
const COMPASS_CENTER = { x: COMPASS_RADIUS + 28, y: COMPASS_RADIUS + 28 }

const compass = computed(() => {
  const northAngle = plan.value?.terrain ? terrainNorthAngle(plan.value.terrain) : 90
  const { x: cx, y: cy } = COMPASS_CENTER

  // Point à `distance` px du centre dans la direction `cardinalAngle` (sens trigo, repère plan) — l'axe Y écran est inversé.
  const at = (cardinalAngle: number, distance: number) => {
    const rad = (cardinalAngle * Math.PI) / 180
    return { x: cx + Math.cos(rad) * distance, y: cy - Math.sin(rad) * distance }
  }

  const tip = at(northAngle, COMPASS_RADIUS - 6)
  const tail = at(northAngle + 180, COMPASS_RADIUS - 6)
  const left = at(northAngle + 90, 6)
  const right = at(northAngle - 90, 6)

  // Les lettres restent horizontales (non pivotées) pour rester lisibles.
  const letters = [
    { text: 'N', angle: northAngle, fill: '#f87171' },
    { text: 'E', angle: northAngle - 90, fill: '#a1a1aa' },
    { text: 'S', angle: northAngle + 180, fill: '#a1a1aa' },
    { text: 'O', angle: northAngle + 90, fill: '#a1a1aa' },
  ].map(({ text, angle, fill }) => {
    const p = at(angle, COMPASS_RADIUS + 12)
    return { x: p.x - 6, y: p.y - 7, width: 12, align: 'center' as const, text, fill, fontSize: 13, fontStyle: 'bold', listening: false }
  })

  return {
    circle: { x: cx, y: cy, radius: COMPASS_RADIUS, fill: 'rgba(16,16,20,0.75)', stroke: 'rgba(255,255,255,0.35)', strokeWidth: 1 },
    north: { points: [tip.x, tip.y, left.x, left.y, right.x, right.y], closed: true, fill: '#ef4444' },
    south: { points: [tail.x, tail.y, left.x, left.y, right.x, right.y], closed: true, fill: '#e4e4e7' },
    letters,
  }
})

// --- Échelle (coin bas-gauche du canvas, fixe à l'écran) ------------------------
// L'échelle du plan dépend du cadrage (elle change avec le contenu) : la barre affiche une longueur « ronde »
// en mètres et sa taille réelle à l'écran. Les gros carreaux de la grille font toujours 1 m.

const SCALE_BAR_LENGTHS_M = [1, 2, 5, 10, 20, 50, 100]
const SCALE_BAR_MAX_PX = 160

const scaleBar = computed(() => {
  const fitting = SCALE_BAR_LENGTHS_M.filter((meters) => meters * scale.value <= SCALE_BAR_MAX_PX)
  const meters = fitting.length > 0 ? fitting[fitting.length - 1] : SCALE_BAR_LENGTHS_M[0]
  const widthPx = meters * scale.value
  const x = 48
  const y = STAGE_HEIGHT - 16
  const tick = (tickX: number) => ({ points: [tickX, y - 5, tickX, y + 5], stroke: '#e4e4e7', strokeWidth: 2 })
  return {
    bar: { points: [x, y, x + widthPx, y], stroke: '#e4e4e7', strokeWidth: 2 },
    ticks: [tick(x), tick(x + widthPx)],
    label: {
      x,
      y: y - 22,
      text: `${meters} m  ·  1 carreau = 1 m`,
      fill: '#e4e4e7',
      fontSize: 12,
      fontStyle: 'bold',
      listening: false,
    },
  }
})

// --- Sélection (pièces à l'étape 3, base de la maison à l'étape 2) -----------

// Sélection multiple : clic = une seule pièce, Maj/Ctrl/Cmd + clic = ajoute/retire de la sélection.
const selectedRoomIds = ref<string[]>([])
const transformerRef = ref<{ getNode: () => import('konva/lib/shapes/Transformer').Transformer } | null>(null)

const selectedRooms = computed(() => plan.value?.rooms.filter((room) => selectedRoomIds.value.includes(room.id)) ?? [])

const roomNodeId = (roomId: string) => `room-rect-${roomId}`
const HOUSE_NODE_ID = 'house-rect'

function transformerNodeIds(): string[] {
  if (showAll.value || moveAllMode.value) return []
  if (step.value === 'terrain') return roadSelected.value && plan.value?.terrain?.road ? [ROAD_NODE_ID] : []
  if (step.value === 'pieces') return selectedRoomIds.value.map(roomNodeId)
  if (step.value === 'base' && plan.value?.house) return [HOUSE_NODE_ID]
  return []
}

// Le transformer suit la sélection : on retrouve les nœuds Konva par leur id plutôt que de les stocker.
function syncTransformer() {
  const transformer = transformerRef.value?.getNode()
  const stage = transformer?.getStage()
  if (!transformer || !stage) return
  const ids = transformerNodeIds()
  const nodes = ids.flatMap((id) => stage.find((node: { id: () => string }) => node.id() === id))
  transformer.nodes(nodes)
  transformer.getLayer()?.batchDraw()
}

watch(
  [step, selectedRoomIds, roadSelected, showAll, moveAllMode, () => plan.value?.rooms.length, () => !!plan.value?.house, () => !!plan.value?.terrain?.road],
  () => void nextTick(syncTransformer),
  { flush: 'post' },
)

// Changer d'étape repart d'une sélection vide.
watch(step, () => {
  selectedRoomIds.value = []
  roadSelected.value = false
  terrainSelected.value = false
})

// --- Rendu : base de la maison (étape 2) ------------------------------------

const houseEditable = computed(() => step.value === 'base')
const houseEmphasised = computed(() => showAll.value || houseEditable.value)

function houseRectConfig() {
  const house = plan.value?.house
  if (!house) return null
  const center = toCanvas(house.center)
  const width = house.width * scale.value
  const height = house.height * scale.value
  return {
    id: HOUSE_NODE_ID,
    x: center.x,
    y: center.y,
    offsetX: width / 2,
    offsetY: height / 2,
    width,
    height,
    rotation: -house.rotation,
    fill: houseEmphasised.value ? 'rgba(56, 189, 248, 0.18)' : 'rgba(56, 189, 248, 0.05)',
    stroke: '#38bdf8',
    strokeWidth: houseEmphasised.value ? 2 : 1,
    dash: [10, 5],
    draggable: houseEditable.value && !moveAllMode.value,
    listening: houseEditable.value && !moveAllMode.value,
  }
}

const houseLabelConfig = computed(() => {
  const house = plan.value?.house
  if (!house || !houseEditable.value) return null
  const center = toCanvas(house.center)
  return {
    x: center.x - 80,
    y: center.y - 16,
    width: 160,
    align: 'center' as const,
    text: `Maison\n${roundMeters(house.width)} × ${roundMeters(house.height)} m`,
    fill: '#bae6fd',
    fontSize: 14,
    fontStyle: 'bold',
    listening: false,
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onHouseDragEnd(e: any) {
  const house = plan.value?.house
  if (!house) return
  const center = toPlan({ x: e.target.x(), y: e.target.y() })
  house.center = { x: snapToGrid(center.x), y: snapToGrid(center.y) }
  // Recale le nœud sur le modèle : si le déplacement s'aligne sur la même case de grille, la config
  // ne change pas et Konva laisserait le nœud là où on l'a lâché.
  e.target.position(toCanvas(house.center))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onHouseTransformEnd(e: any) {
  const house = plan.value?.house
  if (!house) return
  const node = e.target
  const widthPx = node.width() * node.scaleX()
  const heightPx = node.height() * node.scaleY()
  node.scaleX(1)
  node.scaleY(1)

  const center = toPlan({ x: node.x(), y: node.y() })
  house.center = { x: snapToGrid(center.x), y: snapToGrid(center.y) }
  house.width = Math.max(snapToGrid(widthPx / scale.value), GRID_STEP)
  house.height = Math.max(snapToGrid(heightPx / scale.value), GRID_STEP)
  house.rotation = Math.round(-node.rotation()) + 0
}

// --- Rendu : pièces (étape 3) -----------------------------------------------

const roomsEditable = computed(() => step.value === 'pieces')
const roomsEmphasised = computed(() => showAll.value || roomsEditable.value)

// x,y du v-rect = son CENTRE (offsetX/Y = largeur/hauteur ÷ 2) : Konva pivote et redimensionne
// alors autour du centre de la pièce, ce qui correspond exactement à `room.center`.
// Rotation : Konva tourne dans le sens horaire (écran, axe Y vers le bas), notre `rotation` dans le sens
// trigonométrique (repère plan, axe Y vers le haut) — les deux angles sont opposés, d'où le signe « - »
// à l'affichage et à la relecture (sans lui, un angle autre que 0°/90° s'afficherait en miroir de la
// géométrie utilisée pour les coins, la validation et les portes).
function roomRectConfig(room: Room) {
  const center = toCanvas(room.center)
  const width = room.width * scale.value
  const height = room.height * scale.value
  return {
    id: roomNodeId(room.id),
    x: center.x,
    y: center.y,
    offsetX: width / 2,
    offsetY: height / 2,
    width,
    height,
    rotation: -room.rotation,
    fill: CATEGORY_COLORS[room.category],
    // Pas de bordure sur la pièce : ce sont les murs (voir `wallShapes`) qui dessinent le contour. Le liseré
    // de sélection est un calque séparé (`selectionOutlines`), dessiné APRÈS les murs sinon ils le recouvrent.
    opacity: roomsEmphasised.value ? 1 : 0.4,
    draggable: roomsEditable.value && !moveAllMode.value,
    listening: roomsEditable.value && !moveAllMode.value,
  }
}

// Liseré jaune des pièces sélectionnées, posé par-dessus les murs (dessinés après les pièces).
const selectionOutlines = computed(() => {
  if (showAll.value || step.value !== 'pieces') return []
  return selectedRooms.value.map((room) => {
    const center = toCanvas(room.center)
    const width = room.width * scale.value
    const height = room.height * scale.value
    return {
      key: `outline-${room.id}`,
      config: {
        x: center.x,
        y: center.y,
        offsetX: width / 2,
        offsetY: height / 2,
        width,
        height,
        rotation: -room.rotation,
        stroke: '#facc15',
        strokeWidth: 3,
        listening: false,
      },
    }
  })
})

// Le label reste horizontal (non pivoté) pour rester lisible quelle que soit la rotation de la pièce.
function roomLabelConfig(room: Room) {
  const center = toCanvas(room.center)
  const width = room.width * scale.value
  return {
    x: center.x - width / 2,
    y: center.y - 14,
    width,
    align: 'center' as const,
    text: `${room.label}\n${roundMeters(room.width)} × ${roundMeters(room.height)}`,
    fill: 'white',
    fontSize: 13,
    opacity: roomsEmphasised.value ? 1 : 0.4,
    listening: false,
  }
}

// Murs des pièces : un trait épais (épaisseur du type de mur choisi) le long de chaque bord, interrompu au
// niveau des portes. Un mur supprimé laisse à la place un fin pointillé, pour voir qu'il y avait un bord.
const WALL_COLOR = '#e4e4e7'
const WALL_MIN_PX = 2
const EDGES: RoomEdge[] = [0, 1, 2, 3]

interface LineShape {
  key: string
  config: Record<string, unknown>
}

const wallShapes = computed(() => {
  const current = plan.value
  if (!current) return []
  const strokeWidth = Math.max(WALL_TYPES[current.wallType].thickness * scale.value, WALL_MIN_PX)
  const opacity = roomsEmphasised.value ? 1 : 0.4

  return current.rooms.flatMap((room): LineShape[] => {
    const openings = current.roomOpenings.filter((opening) => opening.roomId === room.id)
    return EDGES.flatMap((edge): LineShape[] => {
      if (room.removedWalls.includes(edge)) {
        const { start, end } = roomEdgeSegment(room, edge)
        const a = toCanvas(start)
        const b = toCanvas(end)
        return [
          {
            key: `${room.id}-${edge}-removed`,
            config: { points: [a.x, a.y, b.x, b.y], stroke: '#a1a1aa', strokeWidth: 1, dash: [4, 4], opacity: opacity * 0.7, listening: false },
          },
        ]
      }
      return roomWallSegments(room, edge, openings).map((segment, index) => {
        const a = toCanvas(segment.start)
        const b = toCanvas(segment.end)
        return {
          key: `${room.id}-${edge}-${index}`,
          // lineCap carré : les murs se rejoignent proprement dans les angles.
          config: { points: [a.x, a.y, b.x, b.y], stroke: WALL_COLOR, strokeWidth, lineCap: 'square', opacity, listening: false },
        }
      })
    })
  })
})

// Portes et fenêtres percées dans les bords des pièces et de la base de la maison.
// Une porte se dessine comme le symbole d'un condensateur : un trait perpendiculaire au mur à chaque
// extrémité de l'ouverture, avec un vide entre les deux. Une fenêtre est un trait posé sur le mur.
// Couleurs distinctes du jaune du cadre de sélection, qui masquerait une ouverture jaune.
const OPENING_COLORS: Record<OpeningKind, string> = { interior: '#f8fafc', entrance: '#f97316', window: '#67e8f9' }
const DOOR_JAMB_LENGTH_M = 0.5
const DOOR_JAMB_MIN_PX = 12

const openingLines = computed(() => {
  const current = plan.value
  if (!current) return []

  const shapes = (id: string, segment: { start: PlanPoint; end: PlanPoint }, kind: OpeningKind, emphasised: boolean) => {
    const a = toCanvas(segment.start)
    const b = toCanvas(segment.end)
    const common = {
      stroke: OPENING_COLORS[kind],
      lineCap: 'butt',
      opacity: emphasised ? 1 : 0.4,
      listening: false,
    }

    if (kind === 'window') {
      return [{ key: id, config: { ...common, points: [a.x, a.y, b.x, b.y], strokeWidth: 6 } }]
    }

    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length === 0) return []
    // Normale au mur (en pixels) : les montants dépassent de part et d'autre de l'épaisseur du mur.
    const half = Math.max(DOOR_JAMB_LENGTH_M * scale.value, DOOR_JAMB_MIN_PX) / 2
    const nx = (-(b.y - a.y) / length) * half
    const ny = ((b.x - a.x) / length) * half
    const jamb = (suffix: string, p: PlanPoint) => ({
      key: `${id}-${suffix}`,
      config: { ...common, points: [p.x - nx, p.y - ny, p.x + nx, p.y + ny], strokeWidth: 3 },
    })
    return [jamb('start', a), jamb('end', b)]
  }

  const fromRooms = current.roomOpenings.flatMap((opening) => {
    const room = current.rooms.find((candidate) => candidate.id === opening.roomId)
    return room ? shapes(opening.id, roomOpeningSegment(room, opening), opening.kind, roomsEmphasised.value) : []
  })
  const fromHouse = (current.house?.openings ?? []).flatMap((opening) =>
    shapes(opening.id, houseOpeningSegment(current.house!, opening), opening.kind, houseEmphasised.value),
  )
  return [...fromHouse, ...fromRooms]
})

// Glisser une pièce de la sélection déplace toutes les pièces sélectionnées ensemble : pendant le
// drag c'est le Transformer de Konva qui entraîne les autres nœuds ; à la fin on applique le même
// delta (aligné sur la grille) au modèle de chaque pièce sélectionnée.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function roomNode(e: any, roomId: string) {
  return e.target.getStage()?.find((node: { id: () => string }) => node.id() === roomNodeId(roomId))[0]
}

// Attraper une pièce hors sélection la sélectionne seule.
function onRoomDragStart(room: Room) {
  if (!selectedRoomIds.value.includes(room.id)) selectedRoomIds.value = [room.id]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onRoomDragEnd(room: Room, e: any) {
  const previous = { ...room.center }
  const center = toPlan({ x: e.target.x(), y: e.target.y() })
  room.center = { x: snapToGrid(center.x), y: snapToGrid(center.y) }
  const delta = { x: room.center.x - previous.x, y: room.center.y - previous.y }

  const others = selectedRooms.value.filter((other) => other.id !== room.id)
  for (const other of others) {
    other.center = { x: other.center.x + delta.x, y: other.center.y + delta.y }
  }

  // Recale les nœuds sur le modèle : si le déplacement s'aligne sur la même case de grille, la config
  // ne change pas et Konva laisserait le nœud là où on l'a lâché.
  for (const moved of [room, ...others]) roomNode(e, moved.id)?.position(toCanvas(moved.center))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onRoomTransformEnd(room: Room, e: any) {
  const node = e.target
  const widthPx = node.width() * node.scaleX()
  const heightPx = node.height() * node.scaleY()
  node.scaleX(1)
  node.scaleY(1)

  const center = toPlan({ x: node.x(), y: node.y() })
  room.center = { x: snapToGrid(center.x), y: snapToGrid(center.y) }
  room.width = Math.max(snapToGrid(widthPx / scale.value), GRID_STEP)
  room.height = Math.max(snapToGrid(heightPx / scale.value), GRID_STEP)
  room.rotation = Math.round(-node.rotation()) + 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onRoomClick(room: Room, e: any) {
  const additive = e.evt?.shiftKey || e.evt?.ctrlKey || e.evt?.metaKey
  if (!additive) {
    selectedRoomIds.value = [room.id]
    return
  }
  selectedRoomIds.value = selectedRoomIds.value.includes(room.id)
    ? selectedRoomIds.value.filter((id) => id !== room.id)
    : [...selectedRoomIds.value, room.id]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onStageMouseDown(e: any) {
  if (e.target === e.target.getStage()) {
    selectedRoomIds.value = []
    roadSelected.value = false
    terrainSelected.value = false
  }
}

// --- Export --------------------------------------------------------------------
// L'image montre TOUT le plan (terrain, route, clôture, portes d'entrée, base, pièces, portes et fenêtres),
// recadré pour tout contenir, sans surbrillance ni poignées, quel que soit l'étape affichée. La vue de
// l'utilisateur est restaurée juste après la capture.

const stageRef = ref<{ getNode: () => import('konva/lib/Stage').Stage } | null>(null)
const exporting = ref(false)

const exportTitleConfig = computed(() => ({
  x: STAGE_WIDTH - 320,
  y: 16,
  width: 300,
  align: 'right' as const,
  text: plan.value?.nom ?? '',
  fill: '#f4f4f5',
  fontSize: 18,
  fontStyle: 'bold',
  listening: false,
}))

/** Capture tout le plan (voir plus haut) et renvoie l'image du canvas, ou `null` si la capture est impossible. */
async function captureFullPlan(mimeType: 'image/png' | 'image/jpeg'): Promise<string | null> {
  const stage = stageRef.value?.getNode()
  if (!stage || !plan.value) return null

  const previousFrame = getViewFrame()
  try {
    refitView()
    showAll.value = true
    await nextTick()
    await nextTick()
    syncTransformer()
    // Konva redessine à la prochaine frame : on force le rendu synchrone avant de lire l'image.
    stage.draw()
    return stage.toDataURL({ pixelRatio: 2, mimeType, quality: 0.92 })
  } finally {
    showAll.value = false
    setViewFrame(previousFrame)
  }
}

async function exportPlan(format: ExportFormat) {
  const current = plan.value
  if (!current || exporting.value) return
  const base = exportFileBase(current)

  if (format === 'json') {
    downloadBlob(planToExportJson(current), `${base}.json`, 'application/json')
    return
  }

  exporting.value = true
  try {
    if (format === 'png') {
      const image = await captureFullPlan('image/png')
      if (image) downloadUrl(image, `${base}.png`)
    } else {
      // Le PDF embarque un JPEG : le fond du plan est opaque, donc rien n'est perdu à part un peu de poids.
      const image = await captureFullPlan('image/jpeg')
      if (image) {
        const pdf = jpegToPdf(dataUrlToBytes(image), STAGE_WIDTH * 2, STAGE_HEIGHT * 2)
        downloadBlob(pdf, `${base}.pdf`, 'application/pdf')
      }
    }
  } finally {
    exporting.value = false
  }
}

// --- Glisser tout le contenu (mode « Tout déplacer ») ------------------------------------
// Le calque principal contient tout le contenu du plan ; la grille, la boussole et l'échelle sont dans d'autres calques
// et ne bougent donc pas. Pendant le mode, le calque est glissable et un rectangle transparent couvre toute la zone :
// on peut attraper n'importe où, y compris dans le vide.
const mainLayerConfig = computed(() => {
  const cell = GRID_STEP * scale.value
  return {
    draggable: moveAllMode.value,
    // Le glissement s'aligne sur la grille PENDANT le mouvement : ce qu'on voit est exactement ce qui sera appliqué.
    dragBoundFunc: (position: PlanPoint) => ({
      x: Math.round(position.x / cell) * cell,
      y: Math.round(position.y / cell) * cell,
    }),
  }
})

// Les événements de glisser des éléments du calque (pièces, base…) remontent jusqu'au calque : on ne réagit qu'à
// ceux du calque lui-même.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isLayer = (e: any) => e.target?.getType?.() === 'Layer'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onPanStart(e: any) {
  if (isLayer(e)) isPanning.value = true
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onPanEnd(e: any) {
  if (!isLayer(e)) return
  isPanning.value = false
  const node = e.target
  const cell = GRID_STEP * scale.value
  const cellsX = Math.round(node.x() / cell)
  const cellsY = Math.round(node.y() / cell)
  // Le calque revient à sa place : c'est le contenu (les données) qui a bougé, pas le calque. Axe Y écran inversé.
  node.position({ x: 0, y: 0 })
  if (cellsX !== 0 || cellsY !== 0) planStore.moveAll(props.planId, { x: cellsX * GRID_STEP, y: -cellsY * GRID_STEP })
}

// --- Clavier ------------------------------------------------------------------
// - flèches : déplacent la sélection (pièces à l'étape 3, base de la maison à l'étape 2, route à l'étape 1) d'un pas
//   de grille (Maj = 1 m) ; haut = +Y (axe Y vers le haut) ;
// - Suppr / Retour arrière : supprime les pièces sélectionnées (étape 3) ou la route sélectionnée (étape 1).
// Ignoré quand on tape dans un champ.
const ARROW_DIRECTIONS: Record<string, PlanPoint> = {
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
}

function onKeyDown(event: KeyboardEvent) {
  // Ctrl/Cmd + S enregistre (et évite la boîte « Enregistrer la page » du navigateur), même depuis un champ de saisie.
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
    return
  }

  const target = event.target as HTMLElement | null
  const isTyping = !!target?.closest('input, select, textarea, [contenteditable="true"]')

  // Échap quitte le mode « Tout déplacer » (sauf si on tape dans un champ).
  if (moveAllMode.value && event.key === 'Escape' && !isTyping) {
    moveAllMode.value = false
    return
  }

  const direction = ARROW_DIRECTIONS[event.key]
  const isDelete = event.key === 'Delete' || event.key === 'Backspace'
  if (!direction && !isDelete) return
  if (isTyping) return

  // Mode « Tout déplacer » : les flèches déplacent tout le contenu (Maj = 1 m), rien d'autre n'est sélectionnable.
  if (moveAllMode.value) {
    if (!direction) return
    event.preventDefault()
    const stepSize = event.shiftKey ? 1 : GRID_STEP
    planStore.moveAll(props.planId, { x: direction.x * stepSize, y: direction.y * stepSize })
    return
  }

  // Terrain entier sélectionné (étape 1) : les flèches le déplacent, comme pour la route ou les pièces.
  if (step.value === 'terrain' && terrainSelected.value && !roadSelected.value) {
    if (!direction) return
    event.preventDefault()
    const stepSize = event.shiftKey ? 1 : GRID_STEP
    planStore.moveTerrain(props.planId, { x: direction.x * stepSize, y: direction.y * stepSize })
    return
  }

  const road = plan.value?.terrain?.road
  const movable: { center: PlanPoint }[] =
    step.value === 'pieces'
      ? selectedRooms.value
      : step.value === 'base' && plan.value?.house
        ? [plan.value.house]
        : step.value === 'terrain' && roadSelected.value && road
          ? [road]
          : []
  if (movable.length === 0) return
  if (isDelete && step.value === 'base') return

  event.preventDefault() // évite le défilement de la page (flèches) ou la navigation arrière (Retour arrière)

  if (isDelete) {
    if (step.value === 'terrain') {
      planStore.setRoad(props.planId, null)
      roadSelected.value = false
    } else {
      planStore.removeRooms(props.planId, selectedRoomIds.value)
      selectedRoomIds.value = []
    }
    return
  }

  const stepSize = event.shiftKey ? 1 : GRID_STEP
  let delta = { x: direction.x * stepSize, y: direction.y * stepSize }
  // On ne dépasse pas la limite : au lieu du pas entier, on avance jusqu'au bord.
  // - la base de la maison reste dans le terrain ;
  // - les pièces restent dans la base de la maison (le groupe garde ses positions relatives).
  const house = plan.value?.house ?? null
  if (step.value === 'base' && house) delta = clampHouseMoveToTerrain(house, delta, plan.value?.terrain ?? null)
  else if (step.value === 'pieces') delta = clampRoomsMoveToHouse(selectedRooms.value, delta, house)

  for (const item of movable) {
    item.center = { x: item.center.x + delta.x, y: item.center.y + delta.y }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <section v-if="plan" class="mx-auto max-w-7xl px-4 py-8">
    <RouterLink to="/atelier" class="text-sm text-gray-600 underline">← Mes ateliers</RouterLink>

    <div class="mt-2 flex items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900">{{ plan.nom }}</h1>
        <p v-if="plan.terrain" class="mt-1 text-sm text-gray-600">
          Terrain ≈ {{ Math.round(terrainArea(plan.terrain)) }} m²
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          @click="refitView"
        >
          Recadrer la vue
        </button>
        <button
          type="button"
          :aria-pressed="moveAllMode"
          :disabled="!hasContent"
          :title="
            moveAllMode
              ? 'Cliquer pour quitter le mode (ou Échap)'
              : 'Glisser tout le contenu d\'un bloc ; le repère (axes et grille) reste fixe'
          "
          class="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          :class="
            moveAllMode
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          "
          @click="toggleMoveAll"
        >
          Tout déplacer
        </button>
        <ExportMenu :disabled="exporting" @export="exportPlan" />
        <button
          type="button"
          class="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:cursor-default"
          :class="
            isDirty || isSpinnerVisible
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'border border-gray-300 text-gray-500'
          "
          :disabled="!isDirty || isSaving"
          :aria-busy="isSpinnerVisible"
          :title="`Enregistrer (Ctrl/Cmd + S) — enregistrement automatique après ${AUTOSAVE_DELAY_MS / 1000} s sans modification`"
          @click="save()"
        >
          <span
            v-if="isSpinnerVisible"
            aria-hidden="true"
            class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          <span v-else-if="isDirty" aria-hidden="true" class="h-2 w-2 rounded-full bg-amber-300" />
          {{ isSpinnerVisible ? 'Enregistrement…' : isDirty ? 'Enregistrer' : 'Enregistré ✓' }}
        </button>
      </div>
    </div>

    <StepperNav class="mt-4" :model-value="step" @update:model-value="goToStep" />

    <div class="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
      <div
        class="overflow-hidden rounded-lg bg-[#101014] lg:flex-1"
        :class="moveAllMode ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''"
      >
        <v-stage ref="stageRef" :config="stageConfig" @mousedown="onStageMouseDown">
          <v-layer :config="{ listening: false }">
            <v-rect :config="{ x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT, fill: '#101014' }" />
            <v-line v-for="line in gridLines" :key="line.key" :config="line" />
          </v-layer>
          <v-layer :config="mainLayerConfig" @dragstart="onPanStart" @dragend="onPanEnd">
            <v-rect
              v-if="moveAllMode"
              :config="{ x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT, fill: 'rgba(0, 0, 0, 0)' }"
            />
            <v-rect
              v-if="plan.terrain?.road"
              :config="roadRectConfig()!"
              @click="selectRoad"
              @tap="selectRoad"
              @dragstart="selectRoad"
              @dragend="onRoadDragEnd($event)"
              @transformend="onRoadTransformEnd($event)"
            />
            <v-text v-if="roadLabelConfig" :config="roadLabelConfig" />
            <v-line
              v-if="terrainLineConfig"
              :config="terrainLineConfig"
              @click="selectTerrain"
              @tap="selectTerrain"
              @dragstart="selectTerrain"
              @dragend="onTerrainDragEnd($event)"
            />
            <v-line v-for="segment in fenceLines" :key="segment.key" :config="segment.config" />

            <v-rect
              v-if="plan.house"
              :config="houseRectConfig()!"
              @dragend="onHouseDragEnd($event)"
              @transformend="onHouseTransformEnd($event)"
            />
            <v-text v-if="houseLabelConfig" :config="houseLabelConfig" />

            <template v-for="room in plan.rooms" :key="room.id">
              <v-rect
                :config="roomRectConfig(room)"
                @click="onRoomClick(room, $event)"
                @tap="onRoomClick(room, $event)"
                @dragstart="onRoomDragStart(room)"
                @dragend="onRoomDragEnd(room, $event)"
                @transformend="onRoomTransformEnd(room, $event)"
              />
              <v-text :config="roomLabelConfig(room)" />
            </template>
            <v-line v-for="wall in wallShapes" :key="wall.key" :config="wall.config" />
            <v-line v-for="opening in openingLines" :key="opening.key" :config="opening.config" />
            <v-rect v-for="outline in selectionOutlines" :key="outline.key" :config="outline.config" />
            <!-- Étiquettes des bornes au-dessus des pièces : sinon une borne située sous une pièce n'est plus lisible. -->
            <v-text
              v-for="vertex in terrainLabels"
              :key="vertex.label"
              :config="{ x: vertex.x + 6, y: vertex.y - 16, text: vertex.label, fill: '#c5e8a3', fontSize: 12, fontStyle: 'bold', listening: false }"
            />

            <template v-for="gate in gateShapes" :key="gate.key">
              <v-line :config="gate.line" />
              <v-text :config="gate.label" />
            </template>

            <v-transformer
              ref="transformerRef"
              :config="{
                rotateEnabled: true,
                rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
                borderStroke: '#facc15',
                anchorStroke: '#facc15',
              }"
            />

            <template v-if="step === 'terrain' && !showAll && !moveAllMode">
              <v-circle
                v-for="handle in terrainVertexHandles"
                :key="handle.key"
                :config="terrainVertexConfig(handle.x, handle.y)"
                @dragend="onTerrainVertexDragEnd(handle.index, $event)"
              />
            </template>
          </v-layer>
          <v-layer :config="{ listening: false }">
            <v-circle :config="compass.circle" />
            <v-line :config="compass.south" />
            <v-line :config="compass.north" />
            <v-text v-for="letter in compass.letters" :key="letter.text" :config="letter" />
            <v-line :config="scaleBar.bar" />
            <v-line v-for="(tick, index) in scaleBar.ticks" :key="index" :config="tick" />
            <v-text :config="scaleBar.label" />
            <v-text v-if="showAll" :config="exportTitleConfig" />
          </v-layer>
        </v-stage>
      </div>

      <aside class="flex flex-col gap-4 lg:w-80 lg:shrink-0">
        <TerrainStepPanel v-if="step === 'terrain'" :plan-id="planId" :origin="originPoint" @refit="refitView" />
        <HouseStepPanel v-else-if="step === 'base'" :plan-id="planId" :origin="originPoint" @refit="refitView" />
        <RoomsStepPanel
          v-else
          v-model:selected-ids="selectedRoomIds"
          :plan-id="planId"
          :origin="originPoint"
          @refit="refitView"
        />
      </aside>
    </div>
  </section>

  <section v-else class="mx-auto max-w-4xl px-4 py-8">
    <RouterLink to="/atelier" class="text-sm text-gray-600 underline">← Mes ateliers</RouterLink>

    <p v-if="isLoadingPlan" class="mt-4 text-sm text-gray-600" role="status">Chargement de l'atelier…</p>

    <div v-else-if="planStore.status === 'error'" class="mt-4 rounded-md border border-red-200 bg-red-50 p-4" role="alert">
      <p class="text-sm text-red-700">{{ planStore.error }}</p>
      <button
        type="button"
        class="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
        @click="planStore.ensurePlan(planId)"
      >
        Réessayer
      </button>
    </div>

    <p v-else class="mt-4 text-sm text-gray-600">Atelier introuvable, ou il ne fait pas partie de tes ateliers.</p>
  </section>
</template>

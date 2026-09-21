import { computed, ref, type Ref } from 'vue'
import type { PlanPoint } from '@/shared/types'
import type { Plan } from '../../types'
import { terrainRoadBand } from '../../terrain/services/terrain.service'
import { houseCorners, roomCorners } from '../services/structure.service'

export const STAGE_WIDTH = 900
export const STAGE_HEIGHT = 620
const PADDING = 40

/** Pas de la grille (m) : les déplacements/redimensionnements s'y alignent. */
export const GRID_STEP = 0.5

/** Écart minimal (px) entre deux lignes de 0,5 m pour les afficher. */
const MIN_MINOR_LINE_SPACING_PX = 14

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_STEP) * GRID_STEP
}

/**
 * Passage repère plan (mètres, axe Y vers le haut) <-> pixels du canvas, + grille.
 *
 * Le cadrage (origine + échelle) est FIGÉ : calculé au chargement, puis seulement sur demande
 * (`refitView`) ou quand le contenu change de nature (ajout de pièce, réinitialisation du terrain...).
 * Le recalculer à chaque édition décalerait tout le repère quand on déplace/pivote le terrain :
 * les pièces sembleraient bouger alors que seul le terrain doit bouger.
 */
export function usePlanViewport(plan: Readonly<Ref<Plan | null>>) {
  function computeViewFrame() {
    const points: PlanPoint[] = []
    const terrain = plan.value?.terrain
    if (terrain) {
      for (const vertex of terrain.vertices) points.push(vertex.point)
      for (const annotation of terrain.annotations ?? []) points.push(annotation.point)
      points.push(...(terrainRoadBand(terrain) ?? []))
    }
    if (plan.value?.house) points.push(...houseCorners(plan.value.house))
    for (const room of plan.value?.rooms ?? []) points.push(...roomCorners(room))

    if (points.length === 0) return { minX: 0, minY: 0, scale: 40 }
    // L'origine est calée sur la grille (multiple de GRID_STEP) : sinon les lignes de la grille, alignées sur
    // les multiples absolus de 0,5 m, ne tomberaient jamais sur un mètre entier depuis les axes.
    const minX = Math.floor(Math.min(...points.map((p) => p.x)) / GRID_STEP) * GRID_STEP
    const maxX = Math.max(...points.map((p) => p.x))
    const minY = Math.floor(Math.min(...points.map((p) => p.y)) / GRID_STEP) * GRID_STEP
    const maxY = Math.max(...points.map((p) => p.y))
    const spanX = Math.max(maxX - minX, 1)
    const spanY = Math.max(maxY - minY, 1)
    return {
      minX,
      minY,
      scale: Math.min((STAGE_WIDTH - 2 * PADDING) / spanX, (STAGE_HEIGHT - 2 * PADDING) / spanY),
    }
  }

  const viewFrame = ref(computeViewFrame())

  function refitView() {
    viewFrame.value = computeViewFrame()
  }

  const scale = computed(() => viewFrame.value.scale)

  // Origine relative de l'atelier : point le plus bas/à gauche du contenu au moment du dernier cadrage.
  // Ce n'est pas une coordonnée absolue/GPS — juste un repère local pour représenter à l'échelle et à
  // distance exacte tous les blocs. L'origine (0,0) est affichée en bas à gauche (axe Y vers le haut).
  const originPoint = computed<PlanPoint>(() => ({ x: viewFrame.value.minX, y: viewFrame.value.minY }))

  function toCanvas(point: PlanPoint): PlanPoint {
    return {
      x: (point.x - originPoint.value.x) * scale.value + PADDING,
      y: STAGE_HEIGHT - PADDING - (point.y - originPoint.value.y) * scale.value,
    }
  }

  function toPlan(point: PlanPoint): PlanPoint {
    return {
      x: (point.x - PADDING) / scale.value + originPoint.value.x,
      y: originPoint.value.y + (STAGE_HEIGHT - PADDING - point.y) / scale.value,
    }
  }

  const gridLines = computed(() => {
    const corners = [toPlan({ x: 0, y: 0 }), toPlan({ x: STAGE_WIDTH, y: STAGE_HEIGHT })]
    const minX = Math.floor(Math.min(corners[0].x, corners[1].x) / GRID_STEP) * GRID_STEP
    const maxX = Math.ceil(Math.max(corners[0].x, corners[1].x) / GRID_STEP) * GRID_STEP
    const minY = Math.floor(Math.min(corners[0].y, corners[1].y) / GRID_STEP) * GRID_STEP
    const maxY = Math.ceil(Math.max(corners[0].y, corners[1].y) / GRID_STEP) * GRID_STEP

    // "Majeur"/"axe" s'évaluent par rapport à l'origine relative, pas à zéro absolu.
    const isMajor = (relativeCoord: number) => Math.abs(relativeCoord % 1) < 1e-6
    const isYAxis = (x: number) => Math.abs(x - originPoint.value.x) < 1e-6
    const isXAxis = (y: number) => Math.abs(y - originPoint.value.y) < 1e-6

    // Quand le plan est très dézoomé, les lignes de 0,5 m se tassent en un aplat : on ne garde alors
    // que les lignes de 1 m, qui restent lisibles (et qui correspondent à la barre d'échelle).
    const showMinor = GRID_STEP * scale.value >= MIN_MINOR_LINE_SPACING_PX

    const lines: { key: string; points: number[]; stroke: string; strokeWidth: number }[] = []
    for (let x = minX; x <= maxX + 1e-6; x += GRID_STEP) {
      const a = toCanvas({ x, y: minY })
      const b = toCanvas({ x, y: maxY })
      if (isYAxis(x)) {
        lines.push({ key: 'axis-y', points: [a.x, a.y, b.x, b.y], stroke: '#38bdf8', strokeWidth: 2 })
        continue
      }
      const major = isMajor(x - originPoint.value.x)
      if (!major && !showMinor) continue
      lines.push({
        key: `v-${x}`,
        points: [a.x, a.y, b.x, b.y],
        stroke: major ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)',
        strokeWidth: 1,
      })
    }
    for (let y = minY; y <= maxY + 1e-6; y += GRID_STEP) {
      const a = toCanvas({ x: minX, y })
      const b = toCanvas({ x: maxX, y })
      if (isXAxis(y)) {
        lines.push({ key: 'axis-x', points: [a.x, a.y, b.x, b.y], stroke: '#fb7185', strokeWidth: 2 })
        continue
      }
      const major = isMajor(y - originPoint.value.y)
      if (!major && !showMinor) continue
      lines.push({
        key: `h-${y}`,
        points: [a.x, a.y, b.x, b.y],
        stroke: major ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)',
        strokeWidth: 1,
      })
    }
    return lines
  })

  // Sauvegarde/restauration du cadrage : l'export recadre temporairement tout le plan sans changer la vue de l'utilisateur.
  function getViewFrame() {
    return { ...viewFrame.value }
  }

  function setViewFrame(frame: ReturnType<typeof getViewFrame>) {
    viewFrame.value = frame
  }

  return { scale, originPoint, toCanvas, toPlan, gridLines, refitView, getViewFrame, setViewFrame }
}

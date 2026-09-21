import { polygonArea, polygonCentroid, polygonPerimeter, rectangleCorners, rotatePoint } from '@/shared/geometry'
import type { PlanPoint } from '@/shared/types'
import type { GeoPoint, Gate, Road, Terrain, TerrainVertex } from '../types'

export function terrainArea(terrain: Terrain): number {
  return polygonArea(terrain.vertices.map((vertex) => vertex.point))
}

export function terrainPerimeter(terrain: Terrain): number {
  return polygonPerimeter(terrain.vertices.map((vertex) => vertex.point))
}

export function terrainCentroid(terrain: Terrain): PlanPoint {
  return polygonCentroid(terrain.vertices.map((vertex) => vertex.point))
}

/**
 * Fait pivoter tout le terrain (sommets + annotations) de `deltaDeg` degrés autour de son propre
 * centre — le repère du plan (axes, grille) ne bouge pas, seule la forme du terrain tourne dedans.
 * Les coordonnées GPS d'origine ne sont pas recalculées (comme pour un déplacement manuel de sommet) :
 * après rotation, `geo` ne correspond plus exactement à `point`.
 */
export function rotateTerrainVertices(terrain: Terrain, deltaDeg: number): Terrain {
  const pivot = terrainCentroid(terrain)
  return {
    ...terrain,
    vertices: terrain.vertices.map((vertex) => ({ ...vertex, point: rotatePoint(vertex.point, pivot, deltaDeg) })),
    annotations: terrain.annotations?.map((annotation) => ({
      ...annotation,
      point: rotatePoint(annotation.point, pivot, deltaDeg),
    })),
  }
}

/**
 * Translate tout le terrain (sommets + annotations) de `delta` mètres — le repère du plan ne
 * bouge pas, ni les pièces déjà posées ; seule la position du terrain change dans ce repère fixe.
 * Comme pour la rotation, `geo` n'est pas recalculé après un déplacement.
 */
export function translateTerrainVertices(terrain: Terrain, delta: PlanPoint): Terrain {
  return {
    ...terrain,
    vertices: terrain.vertices.map((vertex) => ({
      ...vertex,
      point: { x: vertex.point.x + delta.x, y: vertex.point.y + delta.y },
    })),
    annotations: terrain.annotations?.map((annotation) => ({
      ...annotation,
      point: { x: annotation.point.x + delta.x, y: annotation.point.y + delta.y },
    })),
  }
}

/**
 * Angle exact (degrés, sens trigonométrique, depuis l'axe X du plan) du côté `index` du terrain,
 * ou `null` s'il n'a pas assez de sommets. C'est la valeur affichée (arrondie) dans le champ « Angle ».
 */
export function terrainSideAngleDeg(terrain: Terrain, index = 0): number | null {
  if (terrain.vertices.length < 2) return null
  const { start, end } = terrainSide(terrain, index)
  return (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI
}

/** Tolérance (degrés) pour considérer un côté comme aligné : bien en dessous de la précision affichée (0,1°). */
const ALIGNMENT_TOLERANCE_DEG = 0.05

/** Ramène un angle dans [-180, 180) : la plus courte rotation pour l'obtenir. */
function normalizeDeg(angleDeg: number): number {
  return ((((angleDeg + 180) % 360) + 360) % 360) - 180
}

/**
 * Angle (degrés, depuis l'axe X) que doit avoir un côté pour être HORIZONTAL ET EN BAS, c'est-à-dire avec
 * le terrain AU-DESSUS de lui. Un côté horizontal a deux orientations possibles (0° ou 180°) : celle qui
 * met le terrain au-dessus dépend du sens dans lequel les sommets sont ordonnés — 0° s'ils tournent dans
 * le sens trigonométrique (l'intérieur est alors à gauche du côté), 180° sinon.
 */
export function bottomSideAngleDeg(terrain: Terrain): number {
  const points = terrain.vertices.map((vertex) => vertex.point)
  let signedArea = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    signedArea += a.x * b.y - b.x * a.y
  }
  return signedArea >= 0 ? 0 : 180
}

/**
 * Prochaine étape des boutons « pivoter à gauche / à droite » : chaque clic POSE EN BAS, à l'horizontale, le
 * côté suivant du terrain (le terrain se retrouve au-dessus de ce côté, donc ce sont ses bornes du bas qui
 * sont alignées). Les côtés sont parcourus dans l'ordre (gauche : 0, 1, 2…, droite : 0, n-1, n-2…).
 *
 * Le terrain saute directement à la bonne orientation, sans animation : la rotation appliquée est la plus
 * courte (moins de 180°), quel que soit le bouton — seul l'ordre de parcours des côtés les distingue.
 *
 * Sans état mémorisé : on repère le côté déjà posé en bas et on passe à celui d'après ; si aucun ne l'est,
 * on commence par le côté 0 (celui dont l'angle est affiché dans le champ). Les côtés déjà posés en bas sont
 * sautés pour qu'un clic fasse toujours quelque chose. Renvoie `null` si le terrain n'a pas assez de côtés.
 */
export function nextBottomAlignmentStep(
  terrain: Terrain,
  direction: 'left' | 'right',
): { sideIndex: number; deltaDeg: number } | null {
  const count = terrain.vertices.length
  if (count < 2) return null

  const target = bottomSideAngleDeg(terrain)
  const deltas = terrain.vertices.map((_, index) => normalizeDeg(target - (terrainSideAngleDeg(terrain, index) as number)))
  const isAligned = (index: number) => Math.abs(deltas[index]) < ALIGNMENT_TOLERANCE_DEG

  const step = direction === 'left' ? 1 : -1
  const current = deltas.findIndex((_, index) => isAligned(index))
  const first = current === -1 ? 0 : (current + step + count) % count

  for (let offset = 0; offset < count; offset++) {
    const sideIndex = (((first + offset * step) % count) + count) % count
    if (!isAligned(sideIndex)) return { sideIndex, deltaDeg: deltas[sideIndex] }
  }
  return null
}

/**
 * Décalage vertical (m) à appliquer au terrain pour que sa ou ses bornes les PLUS BASSES tombent sur un
 * nombre entier de mètres, y étant mesuré depuis `originY` (l'origine du plan, comme dans l'affichage des
 * bornes). On arrondit au mètre le plus proche : le décalage est toujours d'au plus 0,5 m. Si un côté est
 * horizontal en bas, ses deux bornes sont à la même hauteur et tombent donc toutes les deux sur un entier.
 */
export function bottomWholeMeterShift(terrain: Terrain, originY: number): number {
  const lowest = Math.min(...terrain.vertices.map((vertex) => vertex.point.y))
  const relative = lowest - originY
  const shift = Math.round(relative) - relative
  return Math.abs(shift) < 1e-9 ? 0 : shift
}

const METERS_PER_DEGREE_LAT = 111_320

/**
 * Projette des sommets GPS (lat/lng) en mètres dans le repère local du plan, en prenant le premier
 * sommet comme référence (0,0). Projection équirectangulaire — suffisante à l'échelle d'une parcelle
 * (quelques dizaines de mètres) ; une vraie projection (PostGIS ST_Transform) prendra le relais
 * côté serveur une fois la persistance branchée.
 */
export function computeTerrainFromGps(vertices: { label?: string; geo: GeoPoint }[]): Terrain {
  if (vertices.length < 3) {
    throw new Error('Un terrain nécessite au moins 3 sommets.')
  }

  const reference = vertices[0].geo
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((reference.lat * Math.PI) / 180)

  return {
    id: crypto.randomUUID(),
    inputMode: 'gps',
    vertices: vertices.map((vertex) => ({
      label: vertex.label,
      geo: vertex.geo,
      point: {
        x: (vertex.geo.lng - reference.lng) * metersPerDegreeLng,
        y: (vertex.geo.lat - reference.lat) * METERS_PER_DEGREE_LAT,
      },
    })),
  }
}

/**
 * Direction du nord géographique dans le repère du plan, en degrés (sens trigonométrique depuis
 * l'axe X, 90 = vers le haut de l'écran). La projection GPS place le nord sur +Y ; si le terrain a
 * ensuite été pivoté (`geo` n'est pas recalculé), l'écart entre le premier côté en GPS et en mètres
 * donne la rotation à appliquer au nord. Sans deux sommets géolocalisés, on suppose le nord en haut.
 */
export function terrainNorthAngle(terrain: Terrain): number {
  const [a, b] = terrain.vertices
  if (!a?.geo || !b?.geo) return 90

  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((a.geo.lat * Math.PI) / 180)
  const geoAngle = Math.atan2(
    (b.geo.lat - a.geo.lat) * METERS_PER_DEGREE_LAT,
    (b.geo.lng - a.geo.lng) * metersPerDegreeLng,
  )
  const planAngle = Math.atan2(b.point.y - a.point.y, b.point.x - a.point.x)
  return 90 + ((planAngle - geoAngle) * 180) / Math.PI
}

// --- Périphérie : côtés, route, portes d'entrée, clôture ---------------------
// Le côté `i` va du sommet `i` au sommet `i + 1` (le dernier revient au premier).

/** Largeur (m) par défaut d'une route. */
export const ROAD_WIDTH = 4

export interface Segment {
  start: PlanPoint
  end: PlanPoint
}

export function terrainSide(terrain: Terrain, index: number): Segment {
  const { vertices } = terrain
  return { start: vertices[index].point, end: vertices[(index + 1) % vertices.length].point }
}

export function terrainSideLength(terrain: Terrain, index: number): number {
  const { start, end } = terrainSide(terrain, index)
  return Math.hypot(end.x - start.x, end.y - start.y)
}

/** Ex: "B1-2 → B1" — les sommets sans label sont numérotés à partir de 1. */
export function terrainSideLabel(terrain: Terrain, index: number): string {
  const { vertices } = terrain
  const next = (index + 1) % vertices.length
  return `${vertices[index].label ?? index + 1} → ${vertices[next].label ?? next + 1}`
}

/** Normale unitaire du côté `index`, orientée vers l'EXTÉRIEUR du terrain (quel que soit le sens des sommets). */
export function terrainSideOutwardNormal(terrain: Terrain, index: number): PlanPoint {
  const { start, end } = terrainSide(terrain, index)
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1
  const dx = (end.x - start.x) / length
  const dy = (end.y - start.y) / length

  // Aire signée (lacet) : positive = sommets dans le sens trigonométrique.
  const points = terrain.vertices.map((vertex) => vertex.point)
  let signedArea = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    signedArea += a.x * b.y - b.x * a.y
  }
  return signedArea >= 0 ? { x: dy, y: -dx } : { x: -dy, y: dx }
}

/** Rectangle de route (4 coins), ou `null` s'il n'y a pas de route. */
export function terrainRoadBand(terrain: Terrain): PlanPoint[] | null {
  const road = terrain.road
  return road ? rectangleCorners(road.center, road.length, road.width, road.rotation) : null
}

/** Dépassement (m) de la route de part et d'autre du côté sur lequel on l'aligne. */
const ROAD_OVERSHOOT = 4

/** Route posée à l'extérieur du côté `sideIndex`, parallèle à lui — point de départ que l'on ajuste ensuite. */
export function roadAlongSide(terrain: Terrain, sideIndex: number, width = ROAD_WIDTH): Road {
  const { start, end } = terrainSide(terrain, sideIndex)
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const normal = terrainSideOutwardNormal(terrain, sideIndex)
  return {
    center: {
      x: (start.x + end.x) / 2 + (normal.x * width) / 2,
      y: (start.y + end.y) / 2 + (normal.y * width) / 2,
    },
    length: Math.round((length + 2 * ROAD_OVERSHOOT) * 10) / 10,
    width,
    rotation: Math.round(((Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI) * 10) / 10,
  }
}

/** Côté du terrain dont le milieu est le plus proche de `point` (ex: côté qui fait face à la route). */
export function nearestSideIndex(terrain: Terrain, point: PlanPoint): number {
  let best = 0
  let bestDistance = Infinity
  for (let index = 0; index < terrain.vertices.length; index++) {
    const { start, end } = terrainSide(terrain, index)
    const distance = Math.hypot((start.x + end.x) / 2 - point.x, (start.y + end.y) / 2 - point.y)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  }
  return best
}

/** Position d'une porte d'entrée sur son côté, bornée à la longueur du côté (les sommets ont pu bouger). */
export function gateSegment(terrain: Terrain, gate: Gate): Segment | null {
  if (gate.sideIndex < 0 || gate.sideIndex >= terrain.vertices.length) return null
  const { start, end } = terrainSide(terrain, gate.sideIndex)
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  if (length === 0) return null

  const width = Math.min(gate.width, length)
  const offset = Math.min(Math.max(gate.offset, 0), length - width)
  const dx = (end.x - start.x) / length
  const dy = (end.y - start.y) / length
  return {
    start: { x: start.x + dx * offset, y: start.y + dy * offset },
    end: { x: start.x + dx * (offset + width), y: start.y + dy * (offset + width) },
  }
}

/** Tronçons de clôture : tout le périmètre, sauf au niveau des portes d'entrée. */
export function fenceSegments(terrain: Terrain): Segment[] {
  const segments: Segment[] = []
  for (let index = 0; index < terrain.vertices.length; index++) {
    const { start, end } = terrainSide(terrain, index)
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    if (length === 0) continue
    const dx = (end.x - start.x) / length
    const dy = (end.y - start.y) / length
    const pointAt = (distance: number): PlanPoint => ({ x: start.x + dx * distance, y: start.y + dy * distance })

    const gaps = (terrain.gates ?? [])
      .filter((gate) => gate.sideIndex === index)
      .map((gate) => {
        const width = Math.min(gate.width, length)
        const offset = Math.min(Math.max(gate.offset, 0), length - width)
        return { from: offset, to: offset + width }
      })
      .sort((a, b) => a.from - b.from)

    let cursor = 0
    for (const gap of gaps) {
      if (gap.from > cursor) segments.push({ start: pointAt(cursor), end: pointAt(gap.from) })
      cursor = Math.max(cursor, gap.to)
    }
    if (cursor < length) segments.push({ start: pointAt(cursor), end: pointAt(length) })
  }
  return segments
}

export function computeTerrainFromManualDrawing(points: PlanPoint[]): Terrain {
  const vertices: TerrainVertex[] = points.map((point) => ({ point }))
  return {
    id: crypto.randomUUID(),
    inputMode: 'manual',
    vertices,
  }
}

export async function saveTerrain(_terrain: Terrain): Promise<Terrain> {
  throw new Error('Not implemented')
}

// --- Saisie de coordonnées : décimal ou DMS (degrés/minutes/secondes) -------

// Ex: 18°56'32.9"S — degrés, minutes, secondes, point cardinal (N/S/E/O, apostrophe/guillemet droits ou typographiques).
const DMS_PATTERN = /(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)\s*['′]\s*(\d+(?:\.\d+)?)\s*["″]?\s*([NSEOWnseow])/g

function dmsToDecimal(degrees: number, minutes: number, seconds: number, direction: string): number {
  const decimal = degrees + minutes / 60 + seconds / 3600
  const negative = direction === 'S' || direction === 'W' || direction === 'O'
  return negative ? -decimal : decimal
}

function findDmsValues(text: string): number[] {
  const values: number[] = []
  for (const match of text.matchAll(DMS_PATTERN)) {
    const [, degrees, minutes, seconds, direction] = match
    values.push(dmsToDecimal(Number(degrees), Number(minutes), Number(seconds), direction.toUpperCase()))
  }
  return values
}

/**
 * Convertit une saisie libre en un seul nombre décimal : `-18.8792`, ou un composant DMS isolé
 * (`18°56'32.9"S`). Retourne `null` si le texte ne correspond à aucun de ces formats.
 */
export function parseCoordinateValue(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const dmsValues = findDmsValues(trimmed)
  if (dmsValues.length >= 1) return dmsValues[0]

  const value = Number(trimmed)
  return Number.isNaN(value) ? null : value
}

/**
 * Convertit une paire de coordonnées collée en un seul bloc — DMS combiné
 * (`18°56'32.9"S 47°36'52.5"E`, comme affiché par Google Maps) ou décimal (`-18.8792, 47.5079`).
 * Retourne `null` si le texte ne contient pas exactement une paire lat/lng.
 */
export function parseCoordinatePair(text: string): { lat: number; lng: number } | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const dmsValues = findDmsValues(trimmed)
  if (dmsValues.length >= 2) return { lat: dmsValues[0], lng: dmsValues[1] }

  const decimalPair = trimmed.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/)
  if (decimalPair) return { lat: Number(decimalPair[1]), lng: Number(decimalPair[2]) }

  return null
}

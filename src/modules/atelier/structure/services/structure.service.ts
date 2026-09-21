import { polygonArea, polygonContains, polygonPerimeter, polygonsOverlap, rectangleCorners } from '@/shared/geometry'
import type { PlanPoint } from '@/shared/types'
import type { Segment } from '../../terrain/services/terrain.service'
import type { Terrain } from '../../terrain/types'
import type { EdgeOpening, HouseBase, Opening, Room, RoomEdge, Wall } from '../types'

export function roomCorners(room: Room): [PlanPoint, PlanPoint, PlanPoint, PlanPoint] {
  return rectangleCorners(room.center, room.width, room.height, room.rotation)
}

export function roomArea(room: Room): number {
  return polygonArea(roomCorners(room))
}

export function roomPerimeter(room: Room): number {
  return polygonPerimeter(roomCorners(room))
}

/**
 * Règle métier : une pièce ne doit jamais chevaucher une autre pièce du même plan,
 * mais doit toujours être entièrement contenue dans le terrain.
 * Retourne la liste des messages d'erreur (vide si le placement est valide).
 */
export function validateRoomPlacement(room: Room, otherRooms: Room[], terrain: Terrain): string[] {
  const errors: string[] = []
  const terrainPoints = terrain.vertices.map((vertex) => vertex.point)
  const corners = roomCorners(room)

  if (!polygonContains(terrainPoints, corners)) {
    errors.push(`"${room.label}" dépasse des limites du terrain.`)
  }

  for (const other of otherRooms) {
    if (other.id !== room.id && polygonsOverlap(corners, roomCorners(other))) {
      errors.push(`"${room.label}" chevauche "${other.label}".`)
    }
  }

  return errors
}

export function houseCorners(house: HouseBase): [PlanPoint, PlanPoint, PlanPoint, PlanPoint] {
  return rectangleCorners(house.center, house.width, house.height, house.rotation)
}

export function houseArea(house: HouseBase): number {
  return house.width * house.height
}

/** La base de la maison doit tenir entièrement dans le terrain (les pièces, elles, restent libres par rapport à la base). */
export function validateHousePlacement(house: HouseBase, terrain: Terrain): string[] {
  const terrainPoints = terrain.vertices.map((vertex) => vertex.point)
  return polygonContains(terrainPoints, houseCorners(house)) ? [] : ['La base de la maison dépasse des limites du terrain.']
}

/**
 * Fraction (0 à 1) de `delta` que l'on peut appliquer à un rectangle (ses `corners`) sans qu'il SORTE du
 * polygone convexe `container`. 1 = le déplacement complet est possible. Si le rectangle est déjà (en partie)
 * dehors, il n'y a aucune limite (1) : sinon on ne pourrait plus le ramener à l'intérieur.
 *
 * Le conteneur étant convexe, l'ensemble des fractions qui gardent le rectangle dedans est un intervalle qui
 * commence à 0 : une recherche par dichotomie trouve sa borne, et le rectangle s'arrête pile à la limite.
 */
function insideFraction(corners: PlanPoint[], delta: PlanPoint, container: PlanPoint[]): number {
  const isInside = (t: number) =>
    polygonContains(container, corners.map((corner) => ({ x: corner.x + delta.x * t, y: corner.y + delta.y * t })))

  if (!isInside(0) || isInside(1)) return 1

  let inside = 0
  let outside = 1
  for (let i = 0; i < 40; i++) {
    const middle = (inside + outside) / 2
    if (isInside(middle)) inside = middle
    else outside = middle
  }
  // `inside` reste toujours une position valide : on ne dépasse jamais la limite.
  return inside < 1e-9 ? 0 : inside
}

function scaleDelta(delta: PlanPoint, fraction: number): PlanPoint {
  return fraction === 1 ? delta : { x: delta.x * fraction || 0, y: delta.y * fraction || 0 }
}

/** Déplacement de la base de la maison limité au terrain : elle avance jusqu'à la limite, pas au-delà. */
export function clampHouseMoveToTerrain(house: HouseBase, delta: PlanPoint, terrain: Terrain | null): PlanPoint {
  if (!terrain) return delta
  const terrainPoints = terrain.vertices.map((vertex) => vertex.point)
  return scaleDelta(delta, insideFraction(houseCorners(house), delta, terrainPoints))
}

/**
 * Déplacement de pièces limité à la base de la maison : elles avancent jusqu'à la limite (bord contre bord),
 * pas au-delà. Pour un GROUPE, le même décalage réduit s'applique à toutes (celle qui arrive la première au
 * bord limite les autres), ce qui conserve leurs positions relatives. Sans base, le déplacement est libre.
 */
export function clampRoomsMoveToHouse(rooms: Room[], delta: PlanPoint, house: HouseBase | null): PlanPoint {
  if (!house || rooms.length === 0) return delta
  const container = houseCorners(house)
  const fraction = Math.min(...rooms.map((room) => insideFraction(roomCorners(room), delta, container)))
  return scaleDelta(delta, fraction)
}

export const ROOM_EDGE_LABELS: Record<RoomEdge, string> = { 0: 'Bas', 1: 'Droite', 2: 'Haut', 3: 'Gauche' }

/** Longueur (m) du bord `edge` d'un rectangle de dimensions `width` × `height`, dans son repère local. */
export function edgeLength(dimensions: { width: number; height: number }, edge: RoomEdge): number {
  return edge % 2 === 0 ? dimensions.width : dimensions.height
}

/** Segment (repère plan) occupé par une ouverture sur le bord d'un rectangle, borné à la longueur du bord. */
export function edgeOpeningSegment(
  corners: PlanPoint[],
  dimensions: { width: number; height: number },
  opening: EdgeOpening,
): { start: PlanPoint; end: PlanPoint } {
  const a = corners[opening.edge]
  const b = corners[(opening.edge + 1) % 4]
  const length = edgeLength(dimensions, opening.edge)
  const width = Math.min(opening.width, length)
  const offset = Math.min(Math.max(opening.offset, 0), length - width)
  const dx = (b.x - a.x) / length
  const dy = (b.y - a.y) / length
  return {
    start: { x: a.x + dx * offset, y: a.y + dy * offset },
    end: { x: a.x + dx * (offset + width), y: a.y + dy * (offset + width) },
  }
}

export function roomOpeningSegment(room: Room, opening: EdgeOpening) {
  return edgeOpeningSegment(roomCorners(room), room, opening)
}

export function houseOpeningSegment(house: HouseBase, opening: EdgeOpening) {
  return edgeOpeningSegment(houseCorners(house), house, opening)
}

/** Segment complet d'un bord de pièce (repère plan), sans tenir compte des ouvertures. */
export function roomEdgeSegment(room: Room, edge: RoomEdge): Segment {
  const corners = roomCorners(room)
  return { start: corners[edge], end: corners[(edge + 1) % 4] }
}

/**
 * Tronçons de mur à dessiner sur un bord : tout le bord, sauf là où une PORTE est percée (le vide de la
 * porte). Une fenêtre ne coupe pas le mur. Retourne une liste vide si le mur de ce bord est supprimé.
 */
export function roomWallSegments(room: Room, edge: RoomEdge, openings: EdgeOpening[]): Segment[] {
  if (room.removedWalls.includes(edge)) return []

  const { start, end } = roomEdgeSegment(room, edge)
  const length = edgeLength(room, edge)
  const dx = (end.x - start.x) / length
  const dy = (end.y - start.y) / length
  const pointAt = (distance: number): PlanPoint => ({ x: start.x + dx * distance, y: start.y + dy * distance })

  const gaps = openings
    .filter((opening) => opening.edge === edge && opening.kind !== 'window')
    .map((opening) => {
      const width = Math.min(opening.width, length)
      const offset = Math.min(Math.max(opening.offset, 0), length - width)
      return { from: offset, to: offset + width }
    })
    .sort((a, b) => a.from - b.from)

  const segments: Segment[] = []
  let cursor = 0
  for (const gap of gaps) {
    if (gap.from > cursor) segments.push({ start: pointAt(cursor), end: pointAt(gap.from) })
    cursor = Math.max(cursor, gap.to)
  }
  if (cursor < length) segments.push({ start: pointAt(cursor), end: pointAt(length) })
  return segments
}

export function attachOpeningToWall(_opening: Opening, _walls: Wall[]): Opening {
  throw new Error('Not implemented')
}

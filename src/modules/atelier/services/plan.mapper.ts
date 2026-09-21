import type { Plan } from '../types'
import type { EdgeOpening, HouseBase, OpeningKind, Room, RoomCategory, RoomEdge, RoomOpening, WallType } from '../structure/types'
import type { Finish, FurnitureItem, TechnicalSymbol } from '../second-oeuvre/types'
import type { GateKind, Gate, Road, Terrain, TerrainInputMode, TerrainVertex } from '../terrain/types'

// Traduction PURE (sans réseau ni Supabase) d'un plan tel que renvoyé par la base — lignes à plat, snake_case,
// relations imbriquées — vers le type `Plan` de l'application (camelCase, objets imbriqués). Voir Doc/maison2d.dbml.
//
// Les relations 1:1 (terrain, base de maison, route, revêtement) arrivent de PostgREST comme un objet, ou comme
// un tableau d'un élément selon la façon dont la relation est détectée : `one()` accepte les deux.

export interface TerrainPointRecord {
  kind: 'vertex' | 'annotation'
  position: number
  label: string | null
  x: number
  y: number
  lat: number | null
  lng: number | null
}

export interface RoadRecord {
  center_x: number
  center_y: number
  length_m: number
  width_m: number
  rotation: number
}

export interface GateRecord {
  id: string
  side_index: number
  offset_m: number
  width_m: number
  kind: GateKind
}

export interface TerrainRecord {
  id: string
  input_mode: TerrainInputMode
  fenced: boolean
  terrain_points: TerrainPointRecord[]
  roads: RoadRecord | RoadRecord[] | null
  terrain_gates: GateRecord[]
}

export interface OpeningRecord {
  id: string
  edge: number
  offset_m: number
  width_m: number
  kind: OpeningKind
}

export interface HouseRecord {
  center_x: number
  center_y: number
  width_m: number
  height_m: number
  rotation: number
  house_openings: OpeningRecord[]
}

export interface RoomRecord {
  id: string
  position: number
  label: string
  category: RoomCategory
  center_x: number
  center_y: number
  width_m: number
  height_m: number
  rotation: number
  room_openings: OpeningRecord[]
  room_removed_walls: { edge: number }[]
  room_walls: { wall_id: string }[]
  finishes: FinishRecord | FinishRecord[] | null
}

export interface FinishRecord {
  floor_texture: string | null
  wall_color: string | null
}

export interface WallRecord {
  id: string
  start_x: number
  start_y: number
  end_x: number
  end_y: number
  thickness_m: number
  wall_openings: { id: string; type: 'door' | 'window'; offset_m: number; width_m: number }[]
}

export interface FurnitureRecord {
  id: string
  category: FurnitureItem['category']
  label: string
  position_x: number
  position_y: number
  rotation: number
  width_m: number
  height_m: number
}

export interface TechnicalSymbolRecord {
  id: string
  type: TechnicalSymbol['type']
  position_x: number
  position_y: number
}

export interface PlanRecord {
  id: string
  user_id: string
  nom: string
  wall_type: WallType
  terrains: TerrainRecord | TerrainRecord[] | null
  houses: HouseRecord | HouseRecord[] | null
  rooms: RoomRecord[]
  walls: WallRecord[]
  furniture_items: FurnitureRecord[]
  technical_symbols: TechnicalSymbolRecord[]
}

/** Sélection PostgREST qui ramène un plan COMPLET en une seule requête (toutes les relations imbriquées). */
export const PLAN_SELECT = [
  '*',
  'terrains(*,terrain_points(*),roads(*),terrain_gates(*))',
  'houses(*,house_openings(*))',
  'rooms(*,room_openings(*),room_removed_walls(*),room_walls(*),finishes(*))',
  'walls(*,wall_openings(*))',
  'furniture_items(*)',
  'technical_symbols(*)',
].join(',')

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position

// Ordre déterministe des ouvertures (la base n'en garantit aucun) : par bord, puis par position sur le bord.
const byEdgeThenOffset = (a: OpeningRecord, b: OpeningRecord) => a.edge - b.edge || a.offset_m - b.offset_m || a.id.localeCompare(b.id)

function toOpening(record: OpeningRecord): EdgeOpening {
  return {
    id: record.id,
    edge: record.edge as RoomEdge,
    offset: record.offset_m,
    width: record.width_m,
    kind: record.kind,
  }
}

function toVertex(point: TerrainPointRecord): TerrainVertex {
  const vertex: TerrainVertex = { point: { x: point.x, y: point.y } }
  if (point.label !== null) vertex.label = point.label
  if (point.lat !== null && point.lng !== null) vertex.geo = { lat: point.lat, lng: point.lng }
  return vertex
}

function toTerrain(record: TerrainRecord): Terrain {
  const points = [...record.terrain_points].sort(byPosition)
  const vertices = points.filter((point) => point.kind === 'vertex').map(toVertex)
  const annotations = points.filter((point) => point.kind === 'annotation').map(toVertex)

  const road = one(record.roads)
  const gates: Gate[] = [...record.terrain_gates]
    .sort((a, b) => a.side_index - b.side_index || a.offset_m - b.offset_m || a.id.localeCompare(b.id))
    .map((gate) => ({ id: gate.id, sideIndex: gate.side_index, offset: gate.offset_m, width: gate.width_m, kind: gate.kind }))

  const terrain: Terrain = {
    id: record.id,
    inputMode: record.input_mode,
    vertices,
    road: road ? toRoad(road) : null,
    fenced: record.fenced,
    gates,
  }
  // `annotations` est optionnel dans le type : on ne l'ajoute que s'il y en a.
  if (annotations.length > 0) terrain.annotations = annotations
  return terrain
}

function toRoad(record: RoadRecord): Road {
  return {
    center: { x: record.center_x, y: record.center_y },
    length: record.length_m,
    width: record.width_m,
    rotation: record.rotation,
  }
}

function toHouse(record: HouseRecord): HouseBase {
  return {
    center: { x: record.center_x, y: record.center_y },
    width: record.width_m,
    height: record.height_m,
    rotation: record.rotation,
    openings: [...record.house_openings].sort(byEdgeThenOffset).map(toOpening),
  }
}

function toRoom(record: RoomRecord): Room {
  const room: Room = {
    id: record.id,
    label: record.label,
    category: record.category,
    center: { x: record.center_x, y: record.center_y },
    width: record.width_m,
    height: record.height_m,
    rotation: record.rotation,
    removedWalls: record.room_removed_walls.map((wall) => wall.edge as RoomEdge).sort((a, b) => a - b),
  }
  // `wallIds` est optionnel (mode « murs », non utilisé aujourd'hui) : présent seulement s'il y a des murs liés.
  if (record.room_walls.length > 0) room.wallIds = record.room_walls.map((link) => link.wall_id).sort()
  return room
}

/** Convertit un plan lu en base (lignes imbriquées) en `Plan` de l'application. */
export function mapPlanRecord(record: PlanRecord): Plan {
  const rooms = [...record.rooms].sort(byPosition)

  const roomOpenings: RoomOpening[] = rooms.flatMap((room) =>
    [...room.room_openings].sort(byEdgeThenOffset).map((opening) => ({ ...toOpening(opening), roomId: room.id })),
  )

  const finishes: Finish[] = rooms.flatMap((room) => {
    const finish = one(room.finishes)
    if (!finish) return []
    const result: Finish = { roomId: room.id }
    if (finish.floor_texture !== null) result.floorTexture = finish.floor_texture
    if (finish.wall_color !== null) result.wallColor = finish.wall_color
    return [result]
  })

  const terrain = one(record.terrains)
  const house = one(record.houses)

  return {
    id: record.id,
    userId: record.user_id,
    nom: record.nom,
    terrain: terrain ? toTerrain(terrain) : null,
    walls: record.walls.map((wall) => ({
      id: wall.id,
      start: { x: wall.start_x, y: wall.start_y },
      end: { x: wall.end_x, y: wall.end_y },
      thickness: wall.thickness_m,
    })),
    openings: record.walls.flatMap((wall) =>
      wall.wall_openings.map((opening) => ({
        id: opening.id,
        type: opening.type,
        wallId: wall.id,
        offset: opening.offset_m,
        width: opening.width_m,
      })),
    ),
    house: house ? toHouse(house) : null,
    wallType: record.wall_type,
    rooms: rooms.map(toRoom),
    roomOpenings,
    furniture: record.furniture_items.map((item) => ({
      id: item.id,
      category: item.category,
      label: item.label,
      position: { x: item.position_x, y: item.position_y },
      rotation: item.rotation,
      width: item.width_m,
      height: item.height_m,
    })),
    technicalSymbols: record.technical_symbols.map((symbol) => ({
      id: symbol.id,
      type: symbol.type,
      position: { x: symbol.position_x, y: symbol.position_y },
    })),
    finishes,
  }
}

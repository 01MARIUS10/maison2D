import type { TablesInsert } from '@/lib/database.types'
import type { Plan } from '../types'

// Traduction inverse de `plan.mapper.ts` : un `Plan` de l'application -> les lignes à écrire dans chaque table
// (snake_case, une entrée par ligne). PURE : aucun accès réseau, aucune dépendance à Vite ou à Supabase.
// Sert au seed, aux tests, et de socle à la future sauvegarde d'un plan.
//
// Les ids du plan doivent DÉJÀ être des uuid (l'application les génère avec crypto.randomUUID()). Trois types de
// lignes n'ont pas d'id dans le modèle de l'application (points du terrain, base de la maison, murs supprimés) :
// les points laissent la base en générer un, la base de la maison en reçoit un (nécessaire à ses ouvertures).

export interface PlanRows {
  plans: TablesInsert<'plans'>[]
  terrains: TablesInsert<'terrains'>[]
  terrain_points: TablesInsert<'terrain_points'>[]
  roads: TablesInsert<'roads'>[]
  terrain_gates: TablesInsert<'terrain_gates'>[]
  houses: TablesInsert<'houses'>[]
  house_openings: TablesInsert<'house_openings'>[]
  rooms: TablesInsert<'rooms'>[]
  room_openings: TablesInsert<'room_openings'>[]
  room_removed_walls: TablesInsert<'room_removed_walls'>[]
  walls: TablesInsert<'walls'>[]
  wall_openings: TablesInsert<'wall_openings'>[]
  room_walls: TablesInsert<'room_walls'>[]
  furniture_items: TablesInsert<'furniture_items'>[]
  technical_symbols: TablesInsert<'technical_symbols'>[]
  finishes: TablesInsert<'finishes'>[]
}

/** Ordre d'écriture qui respecte les clés étrangères (un parent avant ses enfants) ; à l'envers pour supprimer. */
export const PLAN_TABLES_IN_INSERT_ORDER = [
  'plans',
  'terrains',
  'terrain_points',
  'roads',
  'terrain_gates',
  'houses',
  'house_openings',
  'rooms',
  'room_openings',
  'room_removed_walls',
  'walls',
  'wall_openings',
  'room_walls',
  'furniture_items',
  'technical_symbols',
  'finishes',
] as const satisfies readonly (keyof PlanRows)[]

export interface PlanRowsOptions {
  /** Id de la ligne `houses` (le modèle n'en a pas) : passer une valeur fixe rend le résultat déterministe. */
  houseId?: string
}

export function planToRows(plan: Plan, options: PlanRowsOptions = {}): PlanRows {
  const rows: PlanRows = {
    plans: [{ id: plan.id, user_id: plan.userId, nom: plan.nom, wall_type: plan.wallType }],
    terrains: [],
    terrain_points: [],
    roads: [],
    terrain_gates: [],
    houses: [],
    house_openings: [],
    rooms: [],
    room_openings: [],
    room_removed_walls: [],
    walls: [],
    wall_openings: [],
    room_walls: [],
    furniture_items: [],
    technical_symbols: [],
    finishes: [],
  }

  if (plan.terrain) {
    const terrain = plan.terrain
    rows.terrains.push({ id: terrain.id, plan_id: plan.id, input_mode: terrain.inputMode, fenced: terrain.fenced ?? false })

    const points = [
      ...terrain.vertices.map((vertex, index) => ({ kind: 'vertex' as const, index, vertex })),
      ...(terrain.annotations ?? []).map((vertex, index) => ({ kind: 'annotation' as const, index, vertex })),
    ]
    for (const { kind, index, vertex } of points) {
      rows.terrain_points.push({
        terrain_id: terrain.id,
        kind,
        position: index,
        label: vertex.label ?? null,
        x: vertex.point.x,
        y: vertex.point.y,
        lat: vertex.geo?.lat ?? null,
        lng: vertex.geo?.lng ?? null,
      })
    }

    if (terrain.road) {
      const road = terrain.road
      rows.roads.push({
        terrain_id: terrain.id,
        center_x: road.center.x,
        center_y: road.center.y,
        length_m: road.length,
        width_m: road.width,
        rotation: road.rotation,
      })
    }

    for (const gate of terrain.gates ?? []) {
      rows.terrain_gates.push({
        id: gate.id,
        terrain_id: terrain.id,
        side_index: gate.sideIndex,
        offset_m: gate.offset,
        width_m: gate.width,
        kind: gate.kind,
      })
    }
  }

  if (plan.house) {
    const house = plan.house
    const houseId = options.houseId ?? crypto.randomUUID()
    rows.houses.push({
      id: houseId,
      plan_id: plan.id,
      center_x: house.center.x,
      center_y: house.center.y,
      width_m: house.width,
      height_m: house.height,
      rotation: house.rotation,
    })
    for (const opening of house.openings) {
      rows.house_openings.push({
        id: opening.id,
        house_id: houseId,
        edge: opening.edge,
        offset_m: opening.offset,
        width_m: opening.width,
        kind: opening.kind,
      })
    }
  }

  plan.rooms.forEach((room, index) => {
    rows.rooms.push({
      id: room.id,
      plan_id: plan.id,
      position: index,
      label: room.label,
      category: room.category,
      center_x: room.center.x,
      center_y: room.center.y,
      width_m: room.width,
      height_m: room.height,
      rotation: room.rotation,
    })
    for (const edge of room.removedWalls) rows.room_removed_walls.push({ room_id: room.id, edge })
    for (const wallId of room.wallIds ?? []) rows.room_walls.push({ room_id: room.id, wall_id: wallId })
  })

  for (const opening of plan.roomOpenings) {
    rows.room_openings.push({
      id: opening.id,
      room_id: opening.roomId,
      edge: opening.edge,
      offset_m: opening.offset,
      width_m: opening.width,
      kind: opening.kind,
    })
  }

  for (const wall of plan.walls) {
    rows.walls.push({
      id: wall.id,
      plan_id: plan.id,
      start_x: wall.start.x,
      start_y: wall.start.y,
      end_x: wall.end.x,
      end_y: wall.end.y,
      thickness_m: wall.thickness,
    })
  }
  for (const opening of plan.openings) {
    rows.wall_openings.push({
      id: opening.id,
      wall_id: opening.wallId,
      type: opening.type,
      offset_m: opening.offset,
      width_m: opening.width,
    })
  }

  for (const item of plan.furniture) {
    rows.furniture_items.push({
      id: item.id,
      plan_id: plan.id,
      category: item.category,
      label: item.label,
      position_x: item.position.x,
      position_y: item.position.y,
      rotation: item.rotation,
      width_m: item.width,
      height_m: item.height,
    })
  }
  for (const symbol of plan.technicalSymbols) {
    rows.technical_symbols.push({
      id: symbol.id,
      plan_id: plan.id,
      type: symbol.type,
      position_x: symbol.position.x,
      position_y: symbol.position.y,
    })
  }
  for (const finish of plan.finishes) {
    rows.finishes.push({
      room_id: finish.roomId,
      floor_texture: finish.floorTexture ?? null,
      wall_color: finish.wallColor ?? null,
    })
  }

  return rows
}

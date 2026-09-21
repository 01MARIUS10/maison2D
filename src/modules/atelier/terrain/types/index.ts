import type { PlanPoint } from '@/shared/types'

/** Coordonnée géographique — distincte d'un PlanPoint pour éviter toute confusion. */
export interface GeoPoint {
  lat: number
  lng: number
}

export type TerrainInputMode = 'gps' | 'manual'

export type GateKind = 'pedestrian' | 'vehicle'

/**
 * Route qui longe le terrain : un rectangle libre (centre, longueur le long de la route, largeur,
 * rotation en degrés dans le sens trigonométrique), déplaçable et orientable indépendamment du terrain.
 */
export interface Road {
  center: PlanPoint
  length: number
  width: number
  rotation: number
}

/**
 * Porte d'entrée du terrain (portillon ou portail), posée sur un côté : `sideIndex` désigne le côté
 * `vertices[sideIndex] → vertices[sideIndex + 1]`, `offset` la distance en mètres depuis son début.
 */
export interface Gate {
  id: string
  sideIndex: number
  offset: number
  width: number
  kind: GateKind
}

export interface TerrainVertex {
  /** Ex: "B1", "B2"... — repère visuel affiché à côté du sommet. */
  label?: string
  /** Renseigné uniquement si inputMode === 'gps'. */
  geo?: GeoPoint
  /** Position en mètres dans le repère du plan — toujours renseignée (calculée ou dessinée). */
  point: PlanPoint
}

/**
 * Le terrain est le polygone qui contient tout le reste (maison, pièces, mobilier) : les objets
 * qu'il contient ne sont jamais considérés "en chevauchement" avec lui (voir `Room`).
 * Aire et périmètre se calculent à partir de `vertices` (voir `terrain.service.ts`), jamais stockés.
 */
export interface Terrain {
  id: string
  inputMode: TerrainInputMode
  /** Sommets réels du polygone du terrain, dans l'ordre. */
  vertices: TerrainVertex[]
  /**
   * Points de repère hors polygone (ex: ancienne limite de parcelle avant extension) :
   * affichés à titre indicatif, ignorés dans les calculs d'aire/de confinement.
   */
  annotations?: TerrainVertex[]
  /** Route qui longe le terrain, `null`/absente si aucune. */
  road?: Road | null
  /** Vrai si tout le périmètre du terrain est clôturé (sauf au niveau des portes d'entrée). */
  fenced?: boolean
  gates?: Gate[]
}

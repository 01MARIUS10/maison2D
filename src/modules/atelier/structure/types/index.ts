import type { PlanPoint } from '@/shared/types'

export interface Wall {
  id: string
  start: PlanPoint
  end: PlanPoint
  thickness: number
}

export type OpeningType = 'door' | 'window'

export interface Opening {
  id: string
  type: OpeningType
  wallId: string
  /** Position le long du mur, en mètres depuis `wall.start`. */
  offset: number
  width: number
}

/** Type de mur, commun à tout le plan : détermine l'épaisseur dessinée (voir `WALL_TYPES`). */
export type WallType = 'brique-11' | 'brique-22' | 'parpaing'

export type RoomCategory =
  | 'salon'
  | 'chambre'
  | 'cuisine'
  | 'salle-a-manger'
  | 'salle-de-bain'
  | 'wc'
  | 'garage'
  | 'escalier'
  | 'couloir'
  | 'autre'

/**
 * Une pièce est un rectangle (centre + largeur + hauteur + rotation) qui peut pivoter librement,
 * jamais superposé à une autre pièce du même plan (voir `validateRoomPlacement`) — mais toujours
 * contenu dans le terrain (voir `Terrain`). Les 4 coins, la surface et le périmètre se calculent
 * à partir de ces 4 champs (voir `structure.service.ts`), jamais stockés pour ne pas se
 * désynchroniser.
 */
export interface Room {
  id: string
  label: string
  category: RoomCategory
  /** Centre du rectangle, en mètres (repère du plan). */
  center: PlanPoint
  width: number
  height: number
  /** Rotation en degrés, sens trigonométrique standard (repère y vers le haut). */
  rotation: number
  /** Bords (0 = bas, 1 = droite, 2 = haut, 3 = gauche) dont le mur est supprimé : pièce ouverte sur ce côté. */
  removedWalls: RoomEdge[]
  /** Optionnel : murs (mode dessin avancé) qui bordent cette pièce. */
  wallIds?: string[]
}

/** Bord d'un rectangle (pièce ou base de la maison), dans son repère local : 0 = bas, 1 = droite, 2 = haut, 3 = gauche. */
export type RoomEdge = 0 | 1 | 2 | 3

export type OpeningKind = 'interior' | 'entrance' | 'window'

/** Ouverture (porte ou fenêtre) percée dans un bord d'un rectangle ; `offset` = distance en mètres depuis le début du bord. */
export interface EdgeOpening {
  id: string
  edge: RoomEdge
  offset: number
  width: number
  kind: OpeningKind
}

/** Ouverture percée dans une pièce. */
export interface RoomOpening extends EdgeOpening {
  roomId: string
}

/**
 * Emprise de la maison sur le terrain : un rectangle (longueur × largeur) posé et pivoté sur le terrain.
 * `width` est la longueur (côté horizontal avant rotation), `height` la largeur. Les pièces sont libres
 * par rapport à cette base : elle sert de repère, pas de contrainte de placement.
 */
export interface HouseBase {
  center: PlanPoint
  width: number
  height: number
  /** Degrés, sens trigonométrique (repère y vers le haut), comme `Room.rotation`. */
  rotation: number
  /** Portes de la maison, percées dans les bords de la base. */
  openings: EdgeOpening[]
}

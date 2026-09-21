import type { Terrain } from '../terrain/types'
import type { HouseBase, Opening, Room, RoomOpening, Wall, WallType } from '../structure/types'
import type { Finish, FurnitureItem, TechnicalSymbol } from '../second-oeuvre/types'

/** Agrégat complet d'un plan : terrain (Level 1), structure (Level 1) et second œuvre (Level 2). */
export interface Plan {
  id: string
  userId: string
  nom: string
  terrain: Terrain | null
  walls: Wall[]
  openings: Opening[]
  /** Emprise de la maison sur le terrain (étape « Base de la maison »), `null` tant qu'elle n'est pas posée. */
  house: HouseBase | null
  /** Épaisseur des murs de toutes les pièces (choix global, étape « Pièces et accès »). */
  wallType: WallType
  rooms: Room[]
  /** Portes et fenêtres percées dans les bords des pièces (étape « Pièces et accès »). */
  roomOpenings: RoomOpening[]
  furniture: FurnitureItem[]
  technicalSymbols: TechnicalSymbol[]
  finishes: Finish[]
}

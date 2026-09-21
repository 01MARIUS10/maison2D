import type { PlanPoint } from '@/shared/types'

export type FurnitureCategory = 'mobilier' | 'cuisine' | 'salle-de-bain'

export interface FurnitureItem {
  id: string
  category: FurnitureCategory
  label: string
  position: PlanPoint
  rotation: number
  width: number
  height: number
}

export type TechnicalSymbolType =
  | 'prise'
  | 'interrupteur'
  | 'point-lumineux'
  | 'arrivee-eau'
  | 'evacuation-eau'

export interface TechnicalSymbol {
  id: string
  type: TechnicalSymbolType
  position: PlanPoint
}

export interface Finish {
  roomId: string
  floorTexture?: string
  wallColor?: string
}

export interface InventoryItem {
  label: string
  category: FurnitureCategory
  quantity: number
}

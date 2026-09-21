import type { RoomCategory, WallType } from './types'

export const CATEGORY_LABELS: Record<RoomCategory, string> = {
  salon: 'Salon',
  chambre: 'Chambre',
  cuisine: 'Cuisine',
  'salle-a-manger': 'Salle à manger',
  'salle-de-bain': 'Salle de bain',
  wc: 'WC / douche',
  garage: 'Garage',
  escalier: 'Escalier',
  couloir: 'Couloir',
  autre: 'Autre',
}

export const CATEGORY_COLORS: Record<RoomCategory, string> = {
  salon: '#0f6a5a',
  chambre: '#0f6a5a',
  cuisine: '#0f6a5a',
  'salle-a-manger': '#0f6a5a',
  'salle-de-bain': '#52525b',
  wc: '#52525b',
  garage: '#0f6a5a',
  escalier: '#52525b',
  couloir: '#0f6a5a',
  autre: '#2563eb',
}

/**
 * Types de murs proposés (choix global du plan) et épaisseur dessinée, en mètres.
 * Le parpaing est pris à 20 cm, l'épaisseur courante d'un bloc creux : à ajuster ici si besoin.
 */
export const WALL_TYPES: Record<WallType, { label: string; thickness: number }> = {
  'brique-11': { label: '11 cm (brique)', thickness: 0.11 },
  'brique-22': { label: '22 cm (brique)', thickness: 0.22 },
  parpaing: { label: 'Parpaing (20 cm)', thickness: 0.2 },
}

export const STRUCTURE_STEPS = [
  { id: 'terrain', title: 'Terrain et périphérie', hint: 'Bornes, route, portes d’entrée, clôture' },
  { id: 'base', title: 'Base de la maison', hint: 'Longueur, largeur, position' },
  { id: 'pieces', title: 'Pièces et accès', hint: 'Pièces, portes, couloirs' },
] as const

export type StructureStepId = (typeof STRUCTURE_STEPS)[number]['id']

export function roundMeters(value: number, decimals = 1): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

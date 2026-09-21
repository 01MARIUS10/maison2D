import type { Room } from '../structure/types'
import type { Terrain } from '../terrain/types'
import type { Plan } from '../types'

/** Pièce rectangulaire non pivotée, définie par son coin haut-gauche et ses dimensions (mètres). */
function roomRect(x: number, y: number, width: number, height: number) {
  return { center: { x: x + width / 2, y: y + height / 2 }, width, height, rotation: 0, removedWalls: [] }
}

/**
 * Terrain réel (~393 m²), saisi via le formulaire "Réinitialiser via carte" à partir de coordonnées
 * GPS DMS (ex: 18°56'33.3"S 47°36'52.0"E). `point` est la projection en mètres calculée par
 * `computeTerrainFromGps` (B1-2 comme référence locale (0,0)).
 * La maison ci-dessous garde ses dimensions de l'exemple d'origine (≈15 × 14 m) : elle ne rentre
 * plus entièrement dans ce terrain plus petit — attendu, à ajuster via l'éditeur (déplacement/
 * redimensionnement des pièces) plutôt que dans le mock.
 */
export const mockTerrain: Terrain = {
  id: 'terrain-mock-1',
  inputMode: 'gps',
  vertices: [
    { label: 'B1-2', geo: { lat: -18.942583, lng: 47.614444 }, point: { x: 0, y: 0 } },
    { label: 'B1', geo: { lat: -18.942444, lng: 47.614278 }, point: { x: -17.55, y: 15.46 } },
    { label: 'B4', geo: { lat: -18.942333, lng: 47.614361 }, point: { x: -8.77, y: 27.83 } },
    { label: 'B3', geo: { lat: -18.942472, lng: 47.614556 }, point: { x: 11.7, y: 12.37 } },
  ],
}

export const mockRooms: Room[] = [
  { id: 'room-esc', label: 'Esc.', category: 'escalier', ...roomRect(0, 0, 2, 6) },
  { id: 'room-salon', label: 'Salon', category: 'salon', ...roomRect(2, 0, 6, 6) },
  { id: 'room-sam', label: 'Salle à manger', category: 'salle-a-manger', ...roomRect(2, 6, 6, 3) },
  { id: 'room-cuisine', label: 'Cuisine', category: 'cuisine', ...roomRect(2, 9, 6, 3) },
  { id: 'room-garage', label: 'Garage', category: 'garage', ...roomRect(10, 0, 4, 3) },
  { id: 'room-chambre', label: 'Chambre', category: 'chambre', ...roomRect(10, 3, 4, 5) },
  {
    id: 'room-chambre-parentale',
    label: 'Chambre parentale',
    category: 'chambre',
    ...roomRect(10, 8, 4, 6),
  },
  { id: 'room-wc', label: 'WC-douche', category: 'wc', ...roomRect(8, 9, 2, 3.5) },
]

export const mockPlan: Plan = {
  id: 'plan-mock-1',
  userId: 'user-mock-1',
  nom: 'Maison Andria',
  terrain: mockTerrain,
  walls: [],
  openings: [],
  // Emprise = boîte englobante des pièces du mock (≈ 14 × 14 m), pour montrer l'étape 2 sur des données réelles.
  house: { center: { x: 7, y: 7 }, width: 14, height: 14, rotation: 0, openings: [] },
  wallType: 'brique-22',
  rooms: mockRooms,
  roomOpenings: [],
  furniture: [],
  technicalSymbols: [],
  finishes: [],
}

/** Deuxième atelier, tout juste commencé (terrain défini, aucune pièce encore). */
export const mockPlanStarter: Plan = {
  id: 'plan-mock-2',
  userId: 'user-mock-1',
  nom: 'Terrain Rakoto',
  terrain: {
    id: 'terrain-mock-2',
    inputMode: 'gps',
    vertices: [
      { label: 'A1', point: { x: 0, y: 0 } },
      { label: 'A2', point: { x: 12, y: 0 } },
      { label: 'A3', point: { x: 12, y: 10 } },
      { label: 'A4', point: { x: 0, y: 10 } },
    ],
  },
  walls: [],
  openings: [],
  house: null,
  wallType: 'brique-22',
  rooms: [],
  roomOpenings: [],
  furniture: [],
  technicalSymbols: [],
  finishes: [],
}

export const mockPlans: Plan[] = [mockPlan, mockPlanStarter]

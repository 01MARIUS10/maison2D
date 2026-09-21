import type { Plan } from '../../src/modules/atelier/types/index.ts'
import { mockPlan } from '../../src/modules/atelier/mock/plan.mock.ts'

/**
 * Plan « riche » pour les tests : utilise TOUTES les tables du modèle, avec des valeurs limites (apostrophes,
 * accents, flottants exacts, sommets sans label ni GPS, champs optionnels absents). Toutes les listes sont déjà
 * dans l'ordre canonique du mapper, pour pouvoir comparer le plan relu à celui-ci tel quel.
 */
export function buildRichPlan(): Plan {
  const rich = structuredClone(mockPlan) as Plan
  rich.id = 'plan-riche'
  rich.nom = "Plan d'essai « riche » — l'été"
  rich.wallType = 'parpaing'
  rich.terrain = {
    id: 'terrain-riche',
    inputMode: 'gps',
    vertices: [
      { label: 'B1', geo: { lat: -18.942583, lng: 47.614444 }, point: { x: 0, y: 0 } },
      { point: { x: 12.123456789012345, y: 0.2999999999992724 } },
      { label: 'B3', point: { x: 12, y: 10 } },
      { label: 'B4', geo: { lat: -18.9424, lng: 47.6143 }, point: { x: -0.5, y: 10 } },
    ],
    annotations: [{ label: 'ancienne limite', point: { x: 3, y: 3 } }],
    road: { center: { x: 20.22, y: 21.7 }, length: 33.7, width: 4, rotation: -37.1 },
    fenced: true,
    gates: [
      { id: 'gate-a', sideIndex: 0, offset: 1.5, width: 1, kind: 'pedestrian' },
      { id: 'gate-b', sideIndex: 2, offset: 3, width: 3, kind: 'vehicle' },
    ],
  }
  rich.house = {
    center: { x: 7, y: 7 },
    width: 14,
    height: 14,
    rotation: 30,
    openings: [
      { id: 'hop-1', edge: 0, offset: 2, width: 0.9, kind: 'interior' },
      { id: 'hop-2', edge: 2, offset: 6.5, width: 1, kind: 'entrance' },
    ],
  }
  rich.rooms[1].removedWalls = [1, 3]
  rich.rooms[1].wallIds = ['wall-riche']
  rich.rooms[2].rotation = 45.5

  const openings: Plan['roomOpenings'] = [
    { id: 'rop-1', roomId: 'room-salon', edge: 0, offset: 1, width: 0.9, kind: 'interior' },
    { id: 'rop-2', roomId: 'room-salon', edge: 2, offset: 1.5, width: 0.9, kind: 'entrance' },
    { id: 'rop-3', roomId: 'room-salon', edge: 3, offset: 1.4, width: 1.2, kind: 'window' },
    { id: 'rop-4', roomId: 'room-cuisine', edge: 1, offset: 0.2, width: 1.2, kind: 'window' },
  ]
  // ordre canonique du mapper : par pièce (dans l'ordre des pièces), puis par bord, puis par position
  rich.roomOpenings = rich.rooms.flatMap((room) =>
    openings.filter((o) => o.roomId === room.id).sort((a, b) => a.edge - b.edge || a.offset - b.offset),
  )

  rich.walls = [{ id: 'wall-riche', start: { x: 0, y: 0 }, end: { x: 5.5, y: 0 }, thickness: 0.22 }]
  rich.openings = [{ id: 'wop-1', type: 'door', wallId: 'wall-riche', offset: 1, width: 0.9 }]
  rich.furniture = [
    { id: 'meuble-1', category: 'mobilier', label: "Canapé d'angle", position: { x: 2, y: 2 }, rotation: 15, width: 2.4, height: 1 },
  ]
  rich.technicalSymbols = [{ id: 'sym-1', type: 'point-lumineux', position: { x: 4, y: 4 } }]
  rich.finishes = [
    { roomId: 'room-salon', floorTexture: 'carrelage' },
    { roomId: 'room-sam', wallColor: '#f5f5f4' },
    { roomId: 'room-cuisine' },
  ]
  return rich
}

import { createHash } from 'node:crypto'

// Les ids du mock ('plan-mock-1', 'room-salon'…) ne sont pas des uuid, alors que la base exige des uuid.
// On les convertit de façon DÉTERMINISTE (uuid v5) : rejouer le seed redonne exactement les mêmes ids, et le
// script de vérification peut retrouver, à partir d'un id du mock, l'id qu'il doit relire en base.
const NAMESPACE = 'f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e1f'

export function mockUuid(name: string): string {
  const namespaceBytes = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(namespaceBytes).update(name, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x50 // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80 // variante RFC 4122
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Ids déduits d'un plan du mock. `salt` : suffixe optionnel qui donne d'autres ids, tout aussi déterministes. */
export const ids = {
  plan: (planId: string, salt = '') => mockUuid(planId + salt),
  terrain: (terrainId: string, salt = '') => mockUuid(terrainId + salt),
  house: (planId: string, salt = '') => mockUuid(`${planId}:house${salt}`),
  generic: (originalId: string, salt = '') => mockUuid(originalId + salt),
}

/**
 * Le même plan, avec TOUS ses ids convertis comme le fait le générateur de seed (uuid v5) et son propriétaire
 * remplacé : c'est ce que l'on doit relire en base après un seed. Sert de valeur attendue dans les tests.
 * Avec un `salt`, les ids sont différents de ceux du vrai seed : un test peut alors écrire dans la vraie base
 * sans jamais entrer en collision avec les données réelles.
 */
export function withDatabaseIds<T extends { id: string; userId: string }>(plan: T, ownerId: string, salt = ''): T {
  const copy = structuredClone(plan) as Record<string, any>
  const g = (id: string) => ids.generic(id, salt)

  copy.id = ids.plan(plan.id, salt)
  copy.userId = ownerId
  if (copy.terrain) {
    copy.terrain.id = ids.terrain(copy.terrain.id, salt)
    for (const gate of copy.terrain.gates ?? []) gate.id = g(gate.id)
  }
  for (const opening of copy.house?.openings ?? []) opening.id = g(opening.id)
  for (const room of copy.rooms) {
    room.id = g(room.id)
    if (room.wallIds) room.wallIds = room.wallIds.map(g).sort()
  }
  for (const opening of copy.roomOpenings) {
    opening.id = g(opening.id)
    opening.roomId = g(opening.roomId)
  }
  for (const wall of copy.walls) wall.id = g(wall.id)
  for (const opening of copy.openings) {
    opening.id = g(opening.id)
    opening.wallId = g(opening.wallId)
  }
  for (const item of copy.furniture) item.id = g(item.id)
  for (const symbol of copy.technicalSymbols) symbol.id = g(symbol.id)
  for (const finish of copy.finishes) finish.roomId = g(finish.roomId)
  return copy as T
}

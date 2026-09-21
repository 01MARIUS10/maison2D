import type { Plan } from '../types'

/**
 * Représentation textuelle STABLE d'un plan : mêmes données -> même texte, quel que soit l'ordre dans lequel
 * les propriétés ont été ajoutées aux objets. Sert à savoir si le plan a changé depuis son dernier
 * enregistrement (comparer deux textes), sans dépendre de l'ordre des clés ni des propriétés `undefined`.
 */
export function serializePlan(plan: Plan): string {
  return JSON.stringify(plan, (_key, value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
    const record = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]))
  })
}

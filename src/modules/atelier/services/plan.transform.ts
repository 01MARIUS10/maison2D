import type { PlanPoint } from '@/shared/types'
import type { Plan } from '../types'

/**
 * Déplace TOUT le contenu positionné d'un plan d'un même décalage `delta` (mètres) : bornes et repères du terrain,
 * route, base de la maison, pièces, murs, meubles, symboles techniques. Le repère du plan (axes, grille, origine)
 * n'est pas une donnée du plan et ne bouge donc pas : c'est le contenu qui glisse dedans.
 *
 * Ne bougent pas, car RELATIFS à ce qu'ils percent ou recouvrent, et donc déjà déplacés avec lui : portes d'entrée
 * du terrain (posées sur un côté), ouvertures de la base et des pièces, revêtements, murs supprimés. Les
 * coordonnées GPS des bornes ne sont pas recalculées (comme pour tout déplacement du terrain).
 *
 * Modifie le plan sur place. Chaque point est REMPLACÉ par un nouvel objet plutôt que muté : si deux éléments
 * partageaient le même objet-point, il ne serait pas déplacé deux fois.
 */
export function translatePlanContent(plan: Plan, delta: PlanPoint): void {
  const shifted = (point: PlanPoint): PlanPoint => ({ x: point.x + delta.x, y: point.y + delta.y })

  if (plan.terrain) {
    const terrain = plan.terrain
    terrain.vertices = terrain.vertices.map((vertex) => ({ ...vertex, point: shifted(vertex.point) }))
    if (terrain.annotations) {
      terrain.annotations = terrain.annotations.map((annotation) => ({ ...annotation, point: shifted(annotation.point) }))
    }
    if (terrain.road) terrain.road = { ...terrain.road, center: shifted(terrain.road.center) }
  }

  if (plan.house) plan.house.center = shifted(plan.house.center)
  for (const room of plan.rooms) room.center = shifted(room.center)
  for (const wall of plan.walls) {
    wall.start = shifted(wall.start)
    wall.end = shifted(wall.end)
  }
  for (const item of plan.furniture) item.position = shifted(item.position)
  for (const symbol of plan.technicalSymbols) symbol.position = shifted(symbol.position)
}

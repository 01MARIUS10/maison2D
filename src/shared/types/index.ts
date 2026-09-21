/**
 * Point exprimé en mètres, dans le repère local du plan (terrain, pièces, mobilier...).
 * C'est l'unité de toutes les données géométriques stockées — indépendante du zoom/pan à l'écran.
 */
export interface PlanPoint {
  x: number
  y: number
}

/** Point en pixels à l'écran, obtenu en projetant un PlanPoint via l'échelle/pan du canvas Konva. */
export interface CanvasPoint {
  x: number
  y: number
}

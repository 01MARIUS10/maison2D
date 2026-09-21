import type { PlanPoint } from './types'

/**
 * Les 4 coins d'un rectangle centré sur `center`, pivoté de `rotationDeg` degrés
 * (sens trigonométrique standard, repère y vers le haut).
 */
export function rectangleCorners(
  center: PlanPoint,
  width: number,
  height: number,
  rotationDeg: number,
): [PlanPoint, PlanPoint, PlanPoint, PlanPoint] {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const halfWidth = width / 2
  const halfHeight = height / 2

  const localCorners: PlanPoint[] = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ]

  return localCorners.map(({ x, y }) => ({
    x: center.x + x * cos - y * sin,
    y: center.y + x * sin + y * cos,
  })) as [PlanPoint, PlanPoint, PlanPoint, PlanPoint]
}

/** Fait pivoter un point autour d'un pivot, en degrés (sens trigonométrique standard, y vers le haut). */
export function rotatePoint(point: PlanPoint, pivot: PlanPoint, rotationDeg: number): PlanPoint {
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = point.x - pivot.x
  const dy = point.y - pivot.y
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  }
}

/** Centre géométrique (moyenne simple des sommets) d'un polygone — pivot par défaut pour le faire pivoter. */
export function polygonCentroid(points: PlanPoint[]): PlanPoint {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}

/** Aire d'un polygone (formule du lacet), en m² si les points sont en mètres. */
export function polygonArea(points: PlanPoint[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

/** Périmètre d'un polygone, en mètres si les points sont en mètres. */
export function polygonPerimeter(points: PlanPoint[]): number {
  let total = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return total
}

/**
 * Vrai si deux polygones convexes (rectangles, même pivotés) ont une intersection de surface non nulle.
 * Deux polygones qui se touchent exactement par un bord (cas normal de deux pièces mitoyennes)
 * ne sont PAS considérés en chevauchement — d'où les comparaisons <=/>= plutôt que strictes.
 */
export function polygonsOverlap(a: PlanPoint[], b: PlanPoint[]): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i]
      const p2 = polygon[(i + 1) % polygon.length]
      const axis = { x: -(p2.y - p1.y), y: p2.x - p1.x }

      const [minA, maxA] = projectOntoAxis(a, axis)
      const [minB, maxB] = projectOntoAxis(b, axis)

      if (maxA <= minB || maxB <= minA) return false
    }
  }
  return true
}

function projectOntoAxis(points: PlanPoint[], axis: PlanPoint): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const p of points) {
    const proj = p.x * axis.x + p.y * axis.y
    min = Math.min(min, proj)
    max = Math.max(max, proj)
  }
  return [min, max]
}

/** Vrai si tous les sommets de `inner` sont dans le polygone convexe `outer` (ex: pièce dans le terrain). */
export function polygonContains(outer: PlanPoint[], inner: PlanPoint[]): boolean {
  return inner.every((point) => isPointInConvexPolygon(point, outer))
}

function isPointInConvexPolygon(point: PlanPoint, polygon: PlanPoint[]): boolean {
  let sign = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
    if (cross !== 0) {
      const currentSign = Math.sign(cross)
      if (sign === 0) sign = currentSign
      else if (sign !== currentSign) return false
    }
  }
  return true
}

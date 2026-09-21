import { supabase } from '@/lib/supabase'
import type { Plan } from '../types'
import * as queries from './plan.queries'

// Persistance des plans (Supabase) : lecture, création, enregistrement des modifications et suppression.
// Les requêtes elles-mêmes sont dans plan.queries.ts (qui reçoit le client en paramètre, pour être testable).

export const isPlanId = queries.isPlanId

export function fetchPlans(): Promise<Plan[]> {
  return queries.fetchPlans(supabase)
}

export function fetchPlan(planId: string): Promise<Plan | null> {
  return queries.fetchPlan(supabase, planId)
}

export function createPlan(userId: string, nom: string): Promise<Plan> {
  return queries.insertPlan(supabase, userId, nom)
}

export function deletePlan(planId: string): Promise<void> {
  return queries.removePlan(supabase, planId)
}

/** Enregistre le plan (une transaction : tout ou rien) et renvoie sa date de dernière modification. */
export function savePlan(plan: Plan): Promise<string> {
  return queries.savePlan(supabase, plan)
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import type { Plan } from '../types'
import { PLAN_SELECT, mapPlanRecord, type PlanRecord } from './plan.mapper'
import { planToRows } from './plan.rows'

// Requêtes Supabase sur les plans, écrites pour recevoir le client en paramètre : l'application leur passe le
// sien (voir plan.service.ts) et les scripts de vérification passent le leur — c'est donc EXACTEMENT le même
// code qui est testé contre la vraie base.
//
// La sécurité ne dépend pas de ces requêtes : la RLS ne renvoie que les plans du compte connecté.

export type Client = SupabaseClient<Database>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Vrai si `value` peut être un id de plan. Postgres refuse une valeur non-uuid (400) : on évite l'aller-retour. */
export function isPlanId(value: string): boolean {
  return UUID_PATTERN.test(value)
}

// Le typage des relations imbriquées d'une sélection construite dynamiquement n'est pas inférable par
// supabase-js : la forme du résultat est décrite par `PlanRecord` (voir plan.mapper.ts).
function asRecords(data: unknown): PlanRecord[] {
  return data as PlanRecord[]
}

/** Les plans du compte connecté, du plus récemment modifié au plus ancien, avec toutes leurs données. */
export async function fetchPlans(client: Client): Promise<Plan[]> {
  const { data, error } = await client.from('plans').select(PLAN_SELECT).order('updated_at', { ascending: false })
  if (error) throw new Error(`Impossible de charger les ateliers : ${error.message}`)
  return asRecords(data).map(mapPlanRecord)
}

/** Un plan par son id, ou `null` s'il n'existe pas OU n'appartient pas au compte connecté (indiscernable, voulu). */
export async function fetchPlan(client: Client, planId: string): Promise<Plan | null> {
  if (!isPlanId(planId)) return null
  const { data, error } = await client.from('plans').select(PLAN_SELECT).eq('id', planId).maybeSingle()
  if (error) throw new Error(`Impossible de charger l'atelier : ${error.message}`)
  return data ? mapPlanRecord(asRecords([data])[0]) : null
}

/** Crée un plan vide (sans terrain ni pièce) pour `userId` et le renvoie. */
export async function insertPlan(client: Client, userId: string, nom: string): Promise<Plan> {
  const { data, error } = await client.from('plans').insert({ user_id: userId, nom }).select(PLAN_SELECT).single()
  if (error) throw new Error(`Impossible de créer l'atelier : ${error.message}`)
  return mapPlanRecord(asRecords([data])[0])
}

/**
 * Enregistre un plan complet en UNE transaction (fonction `save_plan`) : tout est remplacé, ou rien ne change.
 * Renvoie la date de dernière modification. Les lignes sont préparées de façon synchrone, avant tout `await` :
 * c'est l'état du plan AU MOMENT de l'appel qui est envoyé, même s'il est modifié pendant l'envoi.
 */
export async function savePlan(client: Client, plan: Plan): Promise<string> {
  const payload = planToRows(plan) as unknown as Json
  const { data, error } = await client.rpc('save_plan', { p_data: payload })
  if (error) {
    // PGRST202 : PostgREST ne trouve pas la fonction — la migration qui l'installe n'a pas été exécutée sur cette base.
    if (error.code === 'PGRST202') {
      throw new Error(
        "Impossible d'enregistrer : la fonction d'enregistrement n'est pas installée sur la base " +
          '(exécuter supabase/migrations/20260921180000_create_save_plan_function.sql dans le SQL Editor de Supabase).',
      )
    }
    throw new Error(`Impossible d'enregistrer l'atelier : ${error.message}`)
  }
  return data
}

/** Supprime un plan et, par cascade, tout ce qui en dépend. */
export async function removePlan(client: Client, planId: string): Promise<void> {
  const { error } = await client.from('plans').delete().eq('id', planId)
  if (error) throw new Error(`Impossible de supprimer l'atelier : ${error.message}`)
}

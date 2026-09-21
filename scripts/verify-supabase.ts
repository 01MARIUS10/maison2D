// Vérification de bout en bout contre la VRAIE base Supabase : lecture dynamique des plans, création,
// enregistrement (fonction save_plan), isolation entre comptes, et nettoyage. C'est le même code que l'application.
//
//   npx --yes tsx scripts/verify-supabase.ts
//
// Écrit UNIQUEMENT sous le compte de test test1@maison2d.dev (README, « Comptes de test »), avec des ids
// impossibles à confondre avec ceux du vrai seed, et supprime tout à la fin — même en cas d'échec.
// Lit VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY dans .env ; n'affiche jamais ces valeurs.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import type { Database } from '../src/lib/database.types.ts'
import { mockPlan } from '../src/modules/atelier/mock/plan.mock.ts'
import { fetchPlan, fetchPlans, insertPlan, removePlan, savePlan, type Client } from '../src/modules/atelier/services/plan.queries.ts'
import { PLAN_TABLES_IN_INSERT_ORDER, planToRows } from '../src/modules/atelier/services/plan.rows.ts'
import { buildRichPlan } from './lib/rich-plan.ts'
import { ids, withDatabaseIds } from './lib/mock-ids.ts'

const TEST_PASSWORD = 'Test1234!'
const OWNER_EMAIL = 'test1@maison2d.dev'
const OTHER_EMAIL = 'test2@maison2d.dev'
const REAL_SEEDED_PLAN_ID = ids.plan(mockPlan.id) // le plan « Maison Andria » du vrai seed, propriété de l'utilisateur

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const readEnv = (key: string) => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? ''
const url = readEnv('VITE_SUPABASE_URL')
const anonKey = readEnv('VITE_SUPABASE_ANON_KEY')
if (!url || !anonKey) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants dans .env')

let failures = 0
const check = (label: string, condition: boolean, detail = '') => {
  if (!condition) failures++
  console.log(condition ? 'OK  ' : 'FAIL', label, detail)
}
async function attempt<T>(action: () => Promise<T>): Promise<{ value?: T; error?: string }> {
  try {
    return { value: await action() }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

const newClient = () => createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function signedIn(email: string): Promise<{ client: Client; userId: string }> {
  const client = newClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error || !data.user) throw new Error(`Connexion impossible pour ${email} : ${error?.message}`)
  return { client, userId: data.user.id }
}

// Valeurs par défaut que la base impose et que le mock omet
const normalize = <T extends { terrain: any }>(plan: T): T => {
  const copy = structuredClone(plan)
  if (copy.terrain) {
    copy.terrain.fenced ??= false
    copy.terrain.gates ??= []
    copy.terrain.road ??= null
  }
  return copy
}

// PostgREST renvoie les `double precision` avec 15 chiffres significatifs (0.2999999999992724 revient en
// 0.299999999999272) : on compare les nombres avec une tolérance très en dessous du millimètre, et on mesure
// l'écart réel pour le rapporter. Tout le reste (textes, ids, ordre des listes, clés présentes) doit être identique.
const TOLERANCE = 1e-9
let worstNumericGap = 0

function differences(actual: unknown, expected: unknown, path = '$', out: string[] = []): string[] {
  if (out.length >= 10) return out
  if (typeof actual === 'number' && typeof expected === 'number') {
    const gap = Math.abs(actual - expected)
    worstNumericGap = Math.max(worstNumericGap, gap)
    if (gap > TOLERANCE * Math.max(1, Math.abs(actual), Math.abs(expected))) out.push(`${path} : ${actual} au lieu de ${expected}`)
  } else if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) out.push(`${path} : ${actual.length} éléments au lieu de ${expected.length}`)
    for (let i = 0; i < Math.min(actual.length, expected.length); i++) differences(actual[i], expected[i], `${path}[${i}]`, out)
  } else if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    const a = actual as Record<string, unknown>
    const e = expected as Record<string, unknown>
    for (const key of new Set([...Object.keys(a), ...Object.keys(e)])) {
      if (!(key in a)) out.push(`${path}.${key} : absent`)
      else if (!(key in e)) out.push(`${path}.${key} : en trop`)
      else differences(a[key], e[key], `${path}.${key}`, out)
    }
  } else if (actual !== expected) {
    out.push(`${path} : ${JSON.stringify(actual)} au lieu de ${JSON.stringify(expected)}`)
  }
  return out
}

const owner = await signedIn(OWNER_EMAIL)
const other = await signedIn(OTHER_EMAIL)
const createdPlanIds: string[] = []

try {
  // --- 0. Sans connexion : rien n'est lisible
  const anonymous = await attempt(() => fetchPlans(newClient()))
  check('sans connexion, la lecture des plans est refusée', anonymous.error !== undefined && /permission denied|JWT|401|42501/i.test(anonymous.error), anonymous.error ?? 'accepté !')

  // --- 1. Ménage d'un éventuel essai précédent interrompu
  const stale = await owner.client.from('plans').select('id').like('nom', '__verif__%')
  for (const row of stale.data ?? []) await removePlan(owner.client, row.id)

  // --- 2. Isolation sur les données RÉELLES de l'utilisateur
  check('le vrai plan « Maison Andria » de l\'utilisateur est invisible depuis un autre compte', (await fetchPlan(owner.client, REAL_SEEDED_PLAN_ID)) === null)
  check('   ... y compris depuis un second compte de test', (await fetchPlan(other.client, REAL_SEEDED_PLAN_ID)) === null)
  const realRoomsSeenByOther = await other.client.from('rooms').select('id').eq('plan_id', REAL_SEEDED_PLAN_ID)
  check('   ... et ses pièces sont invisibles aussi (RLS des tables enfants)', (realRoomsSeenByOther.data ?? []).length === 0)

  const before = await fetchPlans(owner.client)

  // --- 3. Écriture d'un plan riche (16 tables) par l'API, comme le ferait la future sauvegarde
  const salt = `:verif:${Date.now()}`
  const rich = withDatabaseIds(buildRichPlan(), owner.userId, salt)
  rich.nom = `__verif__ ${rich.nom}`
  createdPlanIds.push(rich.id)
  const rows = planToRows(rich)
  let writeError: string | undefined
  for (const table of PLAN_TABLES_IN_INSERT_ORDER) {
    if (rows[table].length === 0) continue
    const { error } = await owner.client.from(table).insert(rows[table] as never)
    if (error) { writeError = `${table} : ${error.message}`; break }
  }
  check('écriture d\'un plan complet dans les 16 tables', writeError === undefined, writeError ?? '')

  // --- 4. Lecture dynamique : le code de l'application, contre le vrai PostgREST
  const plans = await fetchPlans(owner.client)
  check('la liste contient un plan de plus', plans.length === before.length + 1, `(${before.length} -> ${plans.length})`)
  check('le plan le plus récemment modifié est en tête de liste', plans[0]?.id === rich.id)
  const expected = normalize(rich)
  const fromList = plans.find((plan) => plan.id === rich.id)
  const listDiff = differences(fromList, expected)
  check('fetchPlans : le plan est relu à l\'identique (16 tables, relations imbriquées)', fromList !== undefined && listDiff.length === 0, listDiff.length ? `\n  ${listDiff.join('\n  ')}` : '')

  const single = await fetchPlan(owner.client, rich.id)
  const singleDiff = differences(single, expected)
  check('fetchPlan : même résultat par id', single !== null && singleDiff.length === 0, singleDiff.length ? `\n  ${singleDiff.join('\n  ')}` : '')
  check(`précision numérique : écart maximal ${worstNumericGap.toExponential(1)} m (limite 15 chiffres significatifs de l'API)`, worstNumericGap < 1e-9)
  check('fetchPlan : id qui n\'est pas un uuid (ancienne adresse plan-mock-1) -> null sans requête', (await fetchPlan(owner.client, 'plan-mock-1')) === null)
  check('fetchPlan : uuid inexistant -> null', (await fetchPlan(owner.client, '00000000-0000-4000-8000-000000000000')) === null)

  // --- 5. Création / suppression d'un atelier vide
  const created = await insertPlan(owner.client, owner.userId, '__verif__ atelier vide')
  createdPlanIds.push(created.id)
  check('un atelier créé est vide, avec les murs par défaut', created.terrain === null && created.house === null && created.rooms.length === 0 && created.wallType === 'brique-22' && created.userId === owner.userId)
  check('   ... et il apparaît dans la liste', (await fetchPlans(owner.client)).some((plan) => plan.id === created.id))
  await removePlan(owner.client, created.id)
  check('   ... puis disparaît une fois supprimé', (await fetchPlan(owner.client, created.id)) === null)

  // --- 6. Un autre compte ne voit ni ne modifie rien
  check('autre compte : le plan n\'est pas dans sa liste', !(await fetchPlans(other.client)).some((plan) => plan.id === rich.id))
  check('autre compte : lecture par id -> null', (await fetchPlan(other.client, rich.id)) === null)
  const foreignRoom = await other.client.from('rooms').insert({ plan_id: rich.id, label: 'Intrus', category: 'autre', center_x: 0, center_y: 0, width_m: 1, height_m: 1 })
  check('autre compte : impossible d\'ajouter une pièce à ce plan', foreignRoom.error !== null, foreignRoom.error?.message ?? 'accepté !')
  const foreignRename = await other.client.from('plans').update({ nom: 'piraté' }).eq('id', rich.id).select('id')
  check('autre compte : impossible de renommer ce plan', (foreignRename.data ?? []).length === 0)
  const foreignDelete = await other.client.from('plans').delete().eq('id', rich.id).select('id')
  check('autre compte : impossible de le supprimer', (foreignDelete.data ?? []).length === 0 && (await fetchPlan(owner.client, rich.id)) !== null)
  const foreignChildren = await other.client.from('room_openings').select('id').in('room_id', rows.rooms.map((room) => room.id as string))
  check('autre compte : les ouvertures des pièces sont invisibles', (foreignChildren.data ?? []).length === 0)

  // --- 7. Enregistrement : fonction save_plan (migration 20260921180000_create_save_plan_function.sql)
  const probe = await owner.client.rpc('save_plan', { p_data: {} })
  const missing = probe.error !== null && /could not find the function|schema cache/i.test(probe.error.message)
  check('la fonction save_plan est installée sur la base', !missing, missing ? '-> exécuter supabase/migrations/20260921180000_create_save_plan_function.sql dans le SQL Editor' : '')

  if (!missing) {
    // Un atelier vide, comme après « + Nouvel atelier », puis enregistré avec tout son contenu
    const draft = withDatabaseIds(buildRichPlan(), owner.userId, `${salt}:save`)
    draft.nom = '__verif__ enregistrement'
    createdPlanIds.push(draft.id)
    const created = await owner.client.from('plans').insert({ id: draft.id, user_id: owner.userId, nom: 'Atelier vide' })
    check('atelier vide créé pour le test d\'enregistrement', created.error === null, created.error?.message ?? '')

    const savedAt = await attempt(() => savePlan(owner.client, draft))
    check('enregistrer un plan complet (16 tables) renvoie une date', savedAt.error === undefined && !Number.isNaN(Date.parse(savedAt.value ?? '')), savedAt.error ?? '')
    const reread = differences(await fetchPlan(owner.client, draft.id), normalize(draft))
    check('   ... relu à l\'identique après enregistrement', reread.length === 0, reread.length ? `\n  ${reread.join('\n  ')}` : '')

    // Modification : moins de pièces, plus de route ni de portes -> remplacement exact
    const edited = structuredClone(draft)
    edited.nom = '__verif__ modifié'
    edited.wallType = 'brique-11'
    edited.rooms = edited.rooms.slice(0, 2)
    edited.roomOpenings = edited.roomOpenings.filter((o) => edited.rooms.some((r) => r.id === o.roomId))
    edited.finishes = edited.finishes.filter((f) => edited.rooms.some((r) => r.id === f.roomId))
    edited.terrain!.road = null
    edited.terrain!.gates = []
    edited.house!.openings = []
    edited.furniture = []
    const resaved = await attempt(() => savePlan(owner.client, edited))
    check('enregistrer une version modifiée', resaved.error === undefined, resaved.error ?? '')
    const reread2 = differences(await fetchPlan(owner.client, draft.id), normalize(edited))
    check('   ... remplacement exact : ce qui a été supprimé a disparu', reread2.length === 0, reread2.length ? `\n  ${reread2.join('\n  ')}` : '')

    // Atomicité : un envoi invalide (pièce en double, insérée en cours de route) ne doit rien changer
    const invalid = planToRows(edited)
    invalid.rooms.push({ ...invalid.rooms[0] })
    const refused = await owner.client.rpc('save_plan', { p_data: invalid as never })
    check('un envoi invalide est refusé', refused.error !== null, refused.error?.message ?? 'accepté !')
    const untouched = differences(await fetchPlan(owner.client, draft.id), normalize(edited))
    check('   ... ATOMICITÉ : le plan enregistré est intact, aucune écriture partielle', untouched.length === 0, untouched.length ? `\n  ${untouched.join('\n  ')}` : '')

    // Un autre compte ne peut pas enregistrer sur ce plan
    const foreign = await attempt(() => savePlan(other.client, { ...edited, userId: other.userId }))
    check('autre compte : enregistrement sur ce plan refusé', foreign.error !== undefined, foreign.error ?? 'accepté !')
    const intact = differences(await fetchPlan(owner.client, draft.id), normalize(edited))
    check('   ... et le plan est intact', intact.length === 0, intact.length ? `\n  ${intact.join('\n  ')}` : '')

    const anonSave = await newClient().rpc('save_plan', { p_data: planToRows(edited) as never })
    check('sans connexion, l\'enregistrement est refusé', anonSave.error !== null, anonSave.error?.message ?? 'accepté !')
  }
} finally {
  // --- 8. Nettoyage : supprime tout ce que ce script a écrit
  for (const planId of createdPlanIds) await removePlan(owner.client, planId).catch(() => undefined)
}

// --- 9. La suppression du plan a bien tout emporté (cascade), et rien n'a été laissé derrière
const leftovers: string[] = []
for (const planId of createdPlanIds) {
  for (const table of ['terrains', 'houses', 'rooms', 'walls', 'furniture_items', 'technical_symbols'] as const) {
    const { count } = await owner.client.from(table).select('id', { count: 'exact', head: true }).eq('plan_id', planId)
    if (count) leftovers.push(`${table}: ${count}`)
  }
  if ((await fetchPlan(owner.client, planId)) !== null) leftovers.push('plans: 1')
}
check('nettoyage : plus aucune ligne laissée par ce script', leftovers.length === 0, leftovers.join(', '))

console.log(failures === 0 ? '\nTOUT OK' : `\n${failures} ÉCHEC(S)`)
process.exit(failures === 0 ? 0 : 1)

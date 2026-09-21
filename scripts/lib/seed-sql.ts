// Génération du SQL de seed d'un plan : utilisé par scripts/generate-mock-seed.ts (le vrai seed) et par les
// tests, qui écrivent ainsi en base un plan « riche » avec exactement le même code que le seed réel.
//
// Le mapping Plan -> lignes de tables vit dans src/modules/atelier/services/plan.rows.ts (partagé avec
// l'application) ; ce fichier ne fait que convertir les ids du mock en uuid et écrire le SQL.

import type { Plan } from '../../src/modules/atelier/types/index.ts'
import { PLAN_TABLES_IN_INSERT_ORDER, planToRows } from '../../src/modules/atelier/services/plan.rows.ts'
import { ids, withDatabaseIds } from './mock-ids.ts'

// Le propriétaire n'est pas un uuid connu à l'écriture du fichier : le SQL le retrouve par son e-mail (variable
// `v_owner`). Ce marqueur remplace son id dans les lignes, puis est écrit tel quel comme `v_owner`.
const OWNER_MARKER = '__v_owner__'

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`

function literal(column: string, value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return String(value)
  if (column === 'user_id' && value === OWNER_MARKER) return 'v_owner'
  return quote(String(value))
}

function insertStatement(table: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const columns = Object.keys(rows[0])
  const values = rows.map((row) => `(${columns.map((column) => literal(column, row[column])).join(', ')})`)
  return `insert into public.${table} (${columns.join(', ')}) values\n  ${values.join(',\n  ')};\n`
}

/** `ownerEmail` : compte propriétaire écrit dans le script (l'exemple par défaut fait échouer le script exprès). */
export function buildSeedSql(plan: Plan, ownerEmail = 'adresse@du.compte'): string {
  const planId = ids.plan(plan.id)
  const rows = planToRows(withDatabaseIds(plan, OWNER_MARKER), { houseId: ids.house(plan.id) })

  const body = PLAN_TABLES_IN_INSERT_ORDER.map((table) => insertStatement(table, rows[table] as Record<string, unknown>[]))
    .filter(Boolean)
    .join('\n')
    .split('\n')
    .map((line) => (line ? `  ${line}` : line))
    .join('\n')

  return `-- Données du plan « ${plan.nom.replace(/\s+/g, ' ')} » (mock ${plan.id}) — FICHIER GÉNÉRÉ, ne pas éditer à la main.
-- Régénérer : node --experimental-strip-types scripts/generate-mock-seed.ts [adresse@du.compte]
--
-- Marche dans le SQL Editor de Supabase (coller puis Run) ET avec psql (psql -f supabase/seed_plan_mock_1.sql).
--
-- AVANT de lancer :
--   1. la migration supabase/migrations/20260921120000_create_plan_schema.sql doit avoir été exécutée ;
--   2. remplace l'adresse de v_owner_email plus bas par l'e-mail de TON compte (Authentication -> Users).
--      Si tu la laisses telle quelle, le script s'arrête sans rien modifier et liste les comptes existants.
--
-- Rejouable : le plan (id ${planId}) est supprimé puis recréé, avec tout ce qui en dépend (cascade).
-- Le bloc DO est une seule instruction, donc atomique : en cas d'erreur, rien n'est créé ni supprimé.
-- Le script s'exécute hors RLS ; l'application, elle, ne verra le plan que connectée avec le compte propriétaire.

do $seed$
declare
  v_owner_email constant text := ${quote(ownerEmail)};
  v_owner uuid;
begin
  select id into v_owner from public.profiles where mail = v_owner_email;
  if v_owner is null then
    raise exception 'Aucun compte avec le mail "%". Remplace v_owner_email en haut du script par l''un de ces comptes : %',
      v_owner_email, coalesce((select string_agg(mail, ', ' order by mail) from public.profiles), '(aucun profil)');
  end if;

  delete from public.plans where id = '${planId}';

${body}
end
$seed$;

select ${quote(plan.nom)} as plan, '${planId}' as plan_id,
       (select count(*) from public.terrain_points p join public.terrains t on t.id = p.terrain_id where t.plan_id = '${planId}') as bornes,
       (select count(*) from public.rooms where plan_id = '${planId}') as pieces;
`
}

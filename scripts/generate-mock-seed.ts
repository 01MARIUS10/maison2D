// Génère supabase/seed_plan_mock_1.sql à partir de src/modules/atelier/mock/plan.mock.ts.
//
//   node --experimental-strip-types scripts/generate-mock-seed.ts
//
// Le SQL est GÉNÉRÉ, jamais édité à la main : le mock reste la source de vérité et la base ne peut pas en
// diverger. Le fichier produit est rejouable (il supprime puis recrée le plan). Le propriétaire est l'e-mail
// passé en argument ; sans argument, un exemple à remplacer est écrit et le script s'arrête tant qu'il n'est pas changé.
//
//   node --experimental-strip-types scripts/generate-mock-seed.ts [adresse@du.compte]

import { writeFileSync } from 'node:fs'
import { mockPlan } from '../src/modules/atelier/mock/plan.mock.ts'
import { buildSeedSql } from './lib/seed-sql.ts'
import { ids } from './lib/mock-ids.ts'

const ownerEmail = process.argv[2]
writeFileSync(new URL('../supabase/seed_plan_mock_1.sql', import.meta.url), buildSeedSql(mockPlan, ownerEmail))
console.log(`supabase/seed_plan_mock_1.sql généré — plan ${ids.plan(mockPlan.id)}`)

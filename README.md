# maison2D

Application Vue 3 + TypeScript pour concevoir des plans de maison en 2D, avec Supabase (auth + persistance) et Konva (canvas).

## Stack

- Vue 3 + TypeScript (Vite)
- Vue Router / Pinia
- Tailwind CSS v4
- Konva / vue-konva
- Supabase (`@supabase/supabase-js`)

## Architecture modulaire

```
src/
  lib/                  # clients tiers (supabase, ...)
  router/                # assemblage des routes de chaque module
  shared/                # composants / composables / types transverses
  modules/
    auth/                # authentification et profil utilisateur
      components/
      views/
      store/
      services/
      types/
      routes.ts
    atelier/             # conception du plan 2D (canvas Konva), découpé en Level 1 / Level 2
      AtelierLayout.vue   # coquille du parcours en 3 étapes (route parente /atelier)
      types/               # Plan (agrégat terrain + structure + second œuvre)
      store/               # plan.store.ts (plan courant)
      services/            # plan.service.ts (persistance Supabase du plan complet)
      routes.ts
      terrain/             # Level 1 — définition du terrain (GPS via PostGIS, ou dessin manuel)
        components/ views/ store/ services/ types/
      structure/           # Level 1 — édition 2D pure (murs, ouvertures, calcul des surfaces)
        components/objects/ views/ store/ services/ types/
      second-oeuvre/       # Level 2 — mobilier, réseaux techniques, revêtements, inventaire
        components/objects/ views/ store/ services/ types/
```

Chaque module (et chaque sous-domaine de l'atelier) est autonome : types, store Pinia, services, vues, routes, exposés via un `index.ts`. Le `router` central assemble les routes de chaque module ; l'atelier expose une route parente `/atelier` avec trois routes enfants (`terrain`, `structure`, `second-oeuvre`) qui reflètent le parcours utilisateur.

## Utilisateur

Champs du profil (`modules/auth/types`) : `nom`, `ville`, `pays`, `mail`. Le mot de passe (`mdp`) n'est utilisé que dans les identifiants de connexion/inscription, jamais stocké dans le profil.

## Démarrage

```bash
cp .env.example .env   # renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Base de données & migrations

Les migrations SQL versionnées sont dans `supabase/migrations/`. La première (`create_profiles`) crée :

- la table `public.profiles` (id, nom, ville, pays, mail) avec RLS (chacun ne lit/modifie que sa propre ligne) ;
- un trigger `on_auth_user_created` qui crée automatiquement le profil à l'inscription, à partir des métadonnées passées à `supabase.auth.signUp({ options: { data: { nom, ville, pays } } })`.

Pour appliquer une migration sur le projet distant (le CLI n'est pas linké, la connexion directe étant IPv6-only et injoignable depuis certains réseaux) :

```bash
psql "host=aws-1-eu-west-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.sayoubuqwkncpnkzatre password=<db-password> sslmode=require" \
  -v ON_ERROR_STOP=1 -f supabase/migrations/<fichier>.sql
```

Les types TypeScript (`src/lib/database.types.ts`) sont générés depuis le schéma réel :

```bash
supabase gen types typescript --db-url "postgresql://postgres.sayoubuqwkncpnkzatre:<db-password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" > src/lib/database.types.ts
```

### Schéma du plan de maison

Le schéma complet (16 tables : plans, terrain et périphérie, base de la maison, pièces, ouvertures, murs, second œuvre) est décrit dans `Doc/maison2d.dbml` (à coller dans [dbdiagram.io](https://dbdiagram.io)) et créé par `supabase/migrations/20260921120000_create_plan_schema.sql`. La sécurité (RLS) rattache chaque table à son plan : un compte ne voit et ne modifie que ses propres plans.

- **Application** : la liste des ateliers (`/atelier`) et l'éditeur (`/atelier/<id du plan>` -> étape « structure ») lisent les plans depuis Supabase (`src/modules/atelier/services/`). L'identifiant d'un plan est un uuid.
- **Enregistrement** : le bouton « Enregistrer » de l'éditeur (ou Ctrl/Cmd + S) écrit le plan en base via la fonction `public.save_plan` (`supabase/migrations/20260921180000_create_save_plan_function.sql`) : une seule transaction, tout ou rien, avec la RLS de l'appelant. Le plan est aussi enregistré **automatiquement après 30 secondes sans modification** (le bouton affiche alors un indicateur de chargement) ; un échec automatique est signalé, sans réessai en boucle. Quitter la page avec des changements non enregistrés demande confirmation. Dernier enregistrement gagnant (pas de détection de conflit entre onglets).
- **Données d'exemple** : `supabase/seed_plan_mock_1.sql`, généré depuis `plan.mock.ts` (`node --experimental-strip-types scripts/generate-mock-seed.ts <ton e-mail>`). Se colle dans le SQL Editor de Supabase ou se lance avec `psql`, et se rejoue sans danger.
- **Accès à la base depuis le terminal** : crée `.env.local` (ignoré par git) avec `SUPABASE_DB_PASSWORD=...`, puis `scripts/db.sh psql -f <fichier.sql>` ou `scripts/db.sh types` pour régénérer `src/lib/database.types.ts`.
- **Vérification de bout en bout** contre la vraie base (écriture d'un plan complet sous un compte de test, lecture avec le code de l'application, isolation entre comptes, nettoyage) : `npx --yes tsx scripts/verify-supabase.ts`.

### Comptes de test

Créés via `supabase/seed_test_users.sql` (script à usage unique, pas une migration) :

| E-mail | Mot de passe | Nom | Ville | Pays |
|---|---|---|---|---|
| test1@maison2d.dev | Test1234! | Alice Rakoto | Antananarivo | Madagascar |
| test2@maison2d.dev | Test1234! | Bob Andria | Toamasina | Madagascar |

## État actuel

- **Auth** : inscription, connexion, déconnexion, session persistée et synchronisée (`supabase.auth.onAuthStateChange`), guards de route (`/atelier/*` protégé, `/login` et `/register` inaccessibles une fois connecté), pages de connexion/inscription fonctionnelles. Testé de bout en bout dans le navigateur avec les comptes ci-dessus.
- **Atelier** : éditeur de structure en 3 étapes (terrain et périphérie, base de la maison, pièces et accès) avec export PNG / PDF / JSON, alimenté par Supabase (lecture et enregistrement). Le second œuvre (Level 2) reste un squelette.

`CanvasPoint` (`src/shared/types`) et `GeoPoint` (`modules/atelier/terrain/types`) sont deux types distincts à ne jamais mélanger : le premier représente des pixels sur le canvas Konva, le second des coordonnées latitude/longitude.

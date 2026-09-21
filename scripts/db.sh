#!/usr/bin/env bash
# Accès à la base Supabase distante (projet « Atelier ») pour appliquer les migrations, lancer un seed ou
# régénérer les types TypeScript.
#
#   scripts/db.sh psql [options psql]     ex: scripts/db.sh psql -f supabase/migrations/xxx.sql
#   scripts/db.sh types                   régénère src/lib/database.types.ts depuis la base
#
# Le mot de passe de la base est lu dans .env.local (ignoré par git, jamais dans le dépôt) :
#   SUPABASE_DB_PASSWORD=...     (Supabase → Project Settings → Database → Database password)
# La connexion passe par le Session pooler (IPv4) : la connexion directe db.<ref>.supabase.co est IPv6 seulement.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_REF="sayoubuqwkncpnkzatre"
POOLER_HOST="aws-1-eu-west-1.pooler.supabase.com"
DB_USER="postgres.${PROJECT_REF}"

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  echo "SUPABASE_DB_PASSWORD est vide. Ajoute cette ligne dans .env.local (fichier ignoré par git) :" >&2
  echo "  SUPABASE_DB_PASSWORD=le-mot-de-passe-de-la-base" >&2
  exit 2
fi

command_name="${1:-}"
[ -n "$command_name" ] && shift || true

case "$command_name" in
  psql)
    PSQL="$(brew --prefix libpq 2>/dev/null)/bin/psql"
    [ -x "$PSQL" ] || PSQL="$(command -v psql)"
    PGPASSWORD="$SUPABASE_DB_PASSWORD" PGSSLMODE=require exec "$PSQL" \
      "host=${POOLER_HOST} port=5432 dbname=postgres user=${DB_USER}" "$@"
    ;;
  types)
    ENCODED_PASSWORD="$(python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["SUPABASE_DB_PASSWORD"], safe=""))')"
    supabase gen types typescript \
      --db-url "postgresql://${DB_USER}:${ENCODED_PASSWORD}@${POOLER_HOST}:5432/postgres" \
      --schema public > src/lib/database.types.ts.tmp
    mv src/lib/database.types.ts.tmp src/lib/database.types.ts
    echo "src/lib/database.types.ts régénéré"
    ;;
  *)
    echo "Usage : scripts/db.sh psql [options] | scripts/db.sh types" >&2
    exit 1
    ;;
esac

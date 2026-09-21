-- Enregistrement d'un plan en UNE transaction : tout est remplacé, ou rien ne change.
--
-- Pourquoi une fonction plutôt que des requêtes depuis le navigateur : un plan s'écrit dans jusqu'à 16 tables.
-- Enchaînées côté client, une coupure en cours de route laisserait un plan à moitié enregistré (pièces
-- supprimées mais pas recréées, par exemple). Une fonction plpgsql s'exécute dans une seule transaction :
-- en cas d'erreur, tout est annulé et le plan précédent reste intact.
--
-- La fonction est SECURITY INVOKER (comportement par défaut) : elle s'exécute avec les droits de l'appelant,
-- donc la RLS s'applique à chaque suppression et insertion. Un compte ne peut enregistrer que SES plans.
--
-- Entrée : p_data = les lignes de chaque table sous forme JSON, {"plans": [...], "terrains": [...], "rooms": [...], ...},
-- exactement ce que produit planToRows() (src/modules/atelier/services/plan.rows.ts). Les clés sont les noms de colonnes.
-- Sortie : la date de dernière modification du plan (mise à jour par le trigger de plans).

create function public.save_plan(p_data jsonb)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_plan jsonb := p_data -> 'plans' -> 0;
  v_plan_id uuid := (v_plan ->> 'id')::uuid;
  v_updated_at timestamptz;
begin
  if v_plan_id is null then
    raise exception 'save_plan : données invalides (plans[0].id manquant)' using errcode = '22023';
  end if;

  -- Le plan doit exister ET appartenir à l'appelant (la RLS filtre l'update) : sinon rien n'est modifié.
  update public.plans
     set nom = v_plan ->> 'nom',
         wall_type = (v_plan ->> 'wall_type')::public.wall_type
   where id = v_plan_id
  returning updated_at into v_updated_at;

  if not found then
    raise exception 'Atelier introuvable ou non autorisé' using errcode = 'P0002';
  end if;

  -- On repart de zéro : supprimer ces six parents emporte, par cascade, toutes les autres tables du plan.
  delete from public.terrains where plan_id = v_plan_id;
  delete from public.houses where plan_id = v_plan_id;
  delete from public.rooms where plan_id = v_plan_id;
  delete from public.walls where plan_id = v_plan_id;
  delete from public.furniture_items where plan_id = v_plan_id;
  delete from public.technical_symbols where plan_id = v_plan_id;

  -- Réécriture, parents avant enfants. jsonb_populate_recordset lit chaque objet JSON selon les colonnes de la table.
  -- Les tables rattachées directement au plan sont filtrées sur ce plan : un envoi mal formé ne peut pas écrire ailleurs.
  insert into public.terrains
    select * from jsonb_populate_recordset(null::public.terrains, coalesce(p_data -> 'terrains', '[]'::jsonb))
    where plan_id = v_plan_id;

  -- Les points du terrain n'ont pas d'id dans le modèle de l'application : la base en attribue un.
  insert into public.terrain_points (id, terrain_id, kind, position, label, x, y, lat, lng)
    select coalesce(id, gen_random_uuid()), terrain_id, kind, position, label, x, y, lat, lng
    from jsonb_populate_recordset(null::public.terrain_points, coalesce(p_data -> 'terrain_points', '[]'::jsonb));

  insert into public.roads
    select * from jsonb_populate_recordset(null::public.roads, coalesce(p_data -> 'roads', '[]'::jsonb));

  insert into public.terrain_gates
    select * from jsonb_populate_recordset(null::public.terrain_gates, coalesce(p_data -> 'terrain_gates', '[]'::jsonb));

  insert into public.houses
    select * from jsonb_populate_recordset(null::public.houses, coalesce(p_data -> 'houses', '[]'::jsonb))
    where plan_id = v_plan_id;

  insert into public.house_openings
    select * from jsonb_populate_recordset(null::public.house_openings, coalesce(p_data -> 'house_openings', '[]'::jsonb));

  insert into public.rooms
    select * from jsonb_populate_recordset(null::public.rooms, coalesce(p_data -> 'rooms', '[]'::jsonb))
    where plan_id = v_plan_id;

  insert into public.room_openings
    select * from jsonb_populate_recordset(null::public.room_openings, coalesce(p_data -> 'room_openings', '[]'::jsonb));

  insert into public.room_removed_walls
    select * from jsonb_populate_recordset(null::public.room_removed_walls, coalesce(p_data -> 'room_removed_walls', '[]'::jsonb));

  insert into public.walls
    select * from jsonb_populate_recordset(null::public.walls, coalesce(p_data -> 'walls', '[]'::jsonb))
    where plan_id = v_plan_id;

  insert into public.wall_openings
    select * from jsonb_populate_recordset(null::public.wall_openings, coalesce(p_data -> 'wall_openings', '[]'::jsonb));

  insert into public.room_walls
    select * from jsonb_populate_recordset(null::public.room_walls, coalesce(p_data -> 'room_walls', '[]'::jsonb));

  insert into public.furniture_items
    select * from jsonb_populate_recordset(null::public.furniture_items, coalesce(p_data -> 'furniture_items', '[]'::jsonb))
    where plan_id = v_plan_id;

  insert into public.technical_symbols
    select * from jsonb_populate_recordset(null::public.technical_symbols, coalesce(p_data -> 'technical_symbols', '[]'::jsonb))
    where plan_id = v_plan_id;

  insert into public.finishes
    select * from jsonb_populate_recordset(null::public.finishes, coalesce(p_data -> 'finishes', '[]'::jsonb));

  return v_updated_at;
end;
$$;

comment on function public.save_plan(jsonb) is
  'Enregistre un plan complet en une transaction (tout ou rien). Voir le commentaire d''en-tête de la migration.';

-- Réservée aux utilisateurs connectés (jamais anon).
revoke execute on function public.save_plan(jsonb) from public, anon;
grant execute on function public.save_plan(jsonb) to authenticated;

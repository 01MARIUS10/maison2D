-- Données du plan « Maison Andria » (mock plan-mock-1) — FICHIER GÉNÉRÉ, ne pas éditer à la main.
-- Régénérer : node --experimental-strip-types scripts/generate-mock-seed.ts [adresse@du.compte]
--
-- Marche dans le SQL Editor de Supabase (coller puis Run) ET avec psql (psql -f supabase/seed_plan_mock_1.sql).
--
-- AVANT de lancer :
--   1. la migration supabase/migrations/20260921120000_create_plan_schema.sql doit avoir été exécutée ;
--   2. remplace l'adresse de v_owner_email plus bas par l'e-mail de TON compte (Authentication -> Users).
--      Si tu la laisses telle quelle, le script s'arrête sans rien modifier et liste les comptes existants.
--
-- Rejouable : le plan (id 48718edb-f455-5782-9465-a2b49afa784c) est supprimé puis recréé, avec tout ce qui en dépend (cascade).
-- Le bloc DO est une seule instruction, donc atomique : en cas d'erreur, rien n'est créé ni supprimé.
-- Le script s'exécute hors RLS ; l'application, elle, ne verra le plan que connectée avec le compte propriétaire.

do $seed$
declare
  v_owner_email constant text := 'mariustsiorimbola@gmail.com';
  v_owner uuid;
begin
  select id into v_owner from public.profiles where mail = v_owner_email;
  if v_owner is null then
    raise exception 'Aucun compte avec le mail "%". Remplace v_owner_email en haut du script par l''un de ces comptes : %',
      v_owner_email, coalesce((select string_agg(mail, ', ' order by mail) from public.profiles), '(aucun profil)');
  end if;

  delete from public.plans where id = '48718edb-f455-5782-9465-a2b49afa784c';

  insert into public.plans (id, user_id, nom, wall_type) values
    ('48718edb-f455-5782-9465-a2b49afa784c', v_owner, 'Maison Andria', 'brique-22');

  insert into public.terrains (id, plan_id, input_mode, fenced) values
    ('caa5fab2-6793-5462-a80a-63409dd433f8', '48718edb-f455-5782-9465-a2b49afa784c', 'gps', false);

  insert into public.terrain_points (terrain_id, kind, position, label, x, y, lat, lng) values
    ('caa5fab2-6793-5462-a80a-63409dd433f8', 'vertex', 0, 'B1-2', 0, 0, -18.942583, 47.614444),
    ('caa5fab2-6793-5462-a80a-63409dd433f8', 'vertex', 1, 'B1', -17.55, 15.46, -18.942444, 47.614278),
    ('caa5fab2-6793-5462-a80a-63409dd433f8', 'vertex', 2, 'B4', -8.77, 27.83, -18.942333, 47.614361),
    ('caa5fab2-6793-5462-a80a-63409dd433f8', 'vertex', 3, 'B3', 11.7, 12.37, -18.942472, 47.614556);

  insert into public.houses (id, plan_id, center_x, center_y, width_m, height_m, rotation) values
    ('13e427ed-646a-5ed3-8b14-77dca4d8a586', '48718edb-f455-5782-9465-a2b49afa784c', 7, 7, 14, 14, 0);

  insert into public.rooms (id, plan_id, position, label, category, center_x, center_y, width_m, height_m, rotation) values
    ('b642d560-59e9-5246-8151-c9728edbc305', '48718edb-f455-5782-9465-a2b49afa784c', 0, 'Esc.', 'escalier', 1, 3, 2, 6, 0),
    ('6ea949ed-2f9d-5594-a077-36b4ff3a4d45', '48718edb-f455-5782-9465-a2b49afa784c', 1, 'Salon', 'salon', 5, 3, 6, 6, 0),
    ('73ccec0b-5aec-56fe-b6be-1c351711b5db', '48718edb-f455-5782-9465-a2b49afa784c', 2, 'Salle à manger', 'salle-a-manger', 5, 7.5, 6, 3, 0),
    ('5ab4ebf0-cd2c-5b70-a641-8a2bd0302487', '48718edb-f455-5782-9465-a2b49afa784c', 3, 'Cuisine', 'cuisine', 5, 10.5, 6, 3, 0),
    ('26e3f48f-459e-5fa5-a267-e18df1fd5c3e', '48718edb-f455-5782-9465-a2b49afa784c', 4, 'Garage', 'garage', 12, 1.5, 4, 3, 0),
    ('c04cba6c-6d78-5c22-8413-9cba1d1d8147', '48718edb-f455-5782-9465-a2b49afa784c', 5, 'Chambre', 'chambre', 12, 5.5, 4, 5, 0),
    ('2b349021-7c24-5460-a9c5-432685214a13', '48718edb-f455-5782-9465-a2b49afa784c', 6, 'Chambre parentale', 'chambre', 12, 11, 4, 6, 0),
    ('32ecac02-500b-52c7-aaae-9b1b9bf71f3c', '48718edb-f455-5782-9465-a2b49afa784c', 7, 'WC-douche', 'wc', 9, 10.75, 2, 3.5, 0);

end
$seed$;

select 'Maison Andria' as plan, '48718edb-f455-5782-9465-a2b49afa784c' as plan_id,
       (select count(*) from public.terrain_points p join public.terrains t on t.id = p.terrain_id where t.plan_id = '48718edb-f455-5782-9465-a2b49afa784c') as bornes,
       (select count(*) from public.rooms where plan_id = '48718edb-f455-5782-9465-a2b49afa784c') as pieces;

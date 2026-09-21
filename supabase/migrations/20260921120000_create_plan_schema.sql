-- Schéma du plan de maison (Doc/maison2d.dbml) : plans, terrain et périphérie, base de la maison, pièces,
-- ouvertures, et tables réservées (murs, mobilier, symboles techniques, revêtements).
--
-- Conventions (voir l'en-tête de Doc/maison2d.dbml) :
--   - longueurs et coordonnées en mètres, angles en degrés (sens trigonométrique, axe Y vers le haut) ;
--   - `double precision` partout : l'application calcule des flottants, arrondir au mm fausserait les contrôles de bord ;
--   - toutes les clés étrangères sont `on delete cascade` ;
--   - RLS : un utilisateur ne voit et ne modifie que les données de SES plans.

-- ---------------------------------------------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------------------------------------------

create type public.terrain_input_mode as enum ('gps', 'manual');
create type public.terrain_point_kind as enum ('vertex', 'annotation');
create type public.gate_kind as enum ('pedestrian', 'vehicle');
create type public.wall_type as enum ('brique-11', 'brique-22', 'parpaing');
create type public.room_category as enum (
  'salon', 'chambre', 'cuisine', 'salle-a-manger', 'salle-de-bain', 'wc', 'garage', 'escalier', 'couloir', 'autre'
);
create type public.opening_kind as enum ('interior', 'entrance', 'window');
create type public.wall_opening_type as enum ('door', 'window');
create type public.furniture_category as enum ('mobilier', 'cuisine', 'salle-de-bain');
create type public.technical_symbol_type as enum (
  'prise', 'interrupteur', 'point-lumineux', 'arrivee-eau', 'evacuation-eau'
);

-- ---------------------------------------------------------------------------------------------------------
-- Racine : plans
-- ---------------------------------------------------------------------------------------------------------

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  nom text not null,
  wall_type public.wall_type not null default 'brique-22',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.plans is 'Un « atelier » : plan de maison appartenant à un utilisateur.';
comment on column public.plans.wall_type is 'Épaisseur des murs, choix global pour toutes les pièces du plan.';

-- Liste des ateliers d'un utilisateur, du plus récent au plus ancien (filtre RLS + tri).
create index plans_user_id_updated_at_idx on public.plans (user_id, updated_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------
-- Étape 1 — Terrain et périphérie
-- ---------------------------------------------------------------------------------------------------------

create table public.terrains (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null unique references public.plans (id) on delete cascade,
  input_mode public.terrain_input_mode not null,
  fenced boolean not null default false
);

comment on table public.terrains is 'Polygone qui contient tout le reste. Aire, périmètre et centre sont calculés, jamais stockés.';
comment on column public.terrains.fenced is 'Clôture sur tout le périmètre, sauf au niveau des portes d''entrée (terrain_gates).';

create table public.terrain_points (
  id uuid primary key default gen_random_uuid(),
  terrain_id uuid not null references public.terrains (id) on delete cascade,
  kind public.terrain_point_kind not null default 'vertex',
  position integer not null check (position >= 0),
  label text,
  x double precision not null,
  y double precision not null,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  -- l'index unique sert aussi de recherche par terrain_id (première colonne) et fixe l'ordre du contour
  unique (terrain_id, kind, position)
);

comment on table public.terrain_points is 'Sommets du contour (kind = vertex) et repères hors contour (kind = annotation). Le côté i va du point i au point i+1.';
comment on column public.terrain_points.lat is 'Renseignée seulement si le terrain est en mode gps ; non recalculée après rotation/déplacement du terrain.';

create table public.roads (
  terrain_id uuid primary key references public.terrains (id) on delete cascade,
  center_x double precision not null,
  center_y double precision not null,
  length_m double precision not null check (length_m > 0),
  width_m double precision not null check (width_m > 0),
  rotation double precision not null default 0
);

comment on table public.roads is 'Route : rectangle libre (déplaçable, orientable), indépendant des côtés du terrain. Au plus une par terrain.';

create table public.terrain_gates (
  id uuid primary key default gen_random_uuid(),
  terrain_id uuid not null references public.terrains (id) on delete cascade,
  side_index integer not null check (side_index >= 0),
  offset_m double precision not null check (offset_m >= 0),
  width_m double precision not null check (width_m > 0),
  kind public.gate_kind not null
);

comment on table public.terrain_gates is 'Portes d''entrée du terrain (portillon ou portail) posées sur un côté. Distinctes des portes de la maison et des pièces.';

create index terrain_gates_terrain_id_idx on public.terrain_gates (terrain_id);

-- ---------------------------------------------------------------------------------------------------------
-- Étape 2 — Base de la maison
-- ---------------------------------------------------------------------------------------------------------

create table public.houses (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null unique references public.plans (id) on delete cascade,
  center_x double precision not null,
  center_y double precision not null,
  width_m double precision not null check (width_m > 0),
  height_m double precision not null check (height_m > 0),
  rotation double precision not null default 0
);

comment on table public.houses is 'Emprise rectangulaire de la maison. Les pièces restent libres par rapport à elle : c''est un repère, pas une contrainte.';

create table public.house_openings (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses (id) on delete cascade,
  edge smallint not null check (edge between 0 and 3),
  offset_m double precision not null check (offset_m >= 0),
  width_m double precision not null check (width_m > 0),
  kind public.opening_kind not null
);

comment on column public.house_openings.edge is 'Bord de la base dans son repère local : 0 = bas, 1 = droite, 2 = haut, 3 = gauche.';

create index house_openings_house_id_idx on public.house_openings (house_id);

-- ---------------------------------------------------------------------------------------------------------
-- Étape 3 — Pièces et accès
-- ---------------------------------------------------------------------------------------------------------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  position integer not null default 0,
  label text not null,
  category public.room_category not null,
  center_x double precision not null,
  center_y double precision not null,
  width_m double precision not null check (width_m > 0),
  height_m double precision not null check (height_m > 0),
  rotation double precision not null default 0
);

comment on table public.rooms is 'Pièce : rectangle (centre + dimensions + rotation). Jamais superposée à une autre, toujours dans le terrain (contrôle côté application).';
comment on column public.rooms.position is 'Ordre d''affichage dans la liste des pièces (Plan.rooms est un tableau ordonné).';

create index rooms_plan_id_position_idx on public.rooms (plan_id, position);

create table public.room_openings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  edge smallint not null check (edge between 0 and 3),
  offset_m double precision not null check (offset_m >= 0),
  width_m double precision not null check (width_m > 0),
  kind public.opening_kind not null
);

comment on table public.room_openings is 'Portes (interior/entrance) et fenêtres (window) percées dans les bords d''une pièce.';

create index room_openings_room_id_idx on public.room_openings (room_id);

create table public.room_removed_walls (
  room_id uuid not null references public.rooms (id) on delete cascade,
  edge smallint not null check (edge between 0 and 3),
  primary key (room_id, edge)
);

comment on table public.room_removed_walls is 'Côtés dont le mur est supprimé (pièce ouverte sur ce côté). Vide par défaut : une pièce a ses 4 murs.';

-- ---------------------------------------------------------------------------------------------------------
-- Réservé — mode « murs » et second œuvre (types présents, pas encore d'interface)
-- ---------------------------------------------------------------------------------------------------------

create table public.walls (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  start_x double precision not null,
  start_y double precision not null,
  end_x double precision not null,
  end_y double precision not null,
  thickness_m double precision not null check (thickness_m > 0)
);

comment on table public.walls is 'Réservé à un futur mode « dessin mur par mur ». Plan.walls est vide aujourd''hui.';

create index walls_plan_id_idx on public.walls (plan_id);

create table public.wall_openings (
  id uuid primary key default gen_random_uuid(),
  wall_id uuid not null references public.walls (id) on delete cascade,
  type public.wall_opening_type not null,
  offset_m double precision not null check (offset_m >= 0),
  width_m double precision not null check (width_m > 0)
);

comment on table public.wall_openings is 'Réservé : ouverture posée sur un mur (à ne pas confondre avec room_openings / house_openings).';

create index wall_openings_wall_id_idx on public.wall_openings (wall_id);

create table public.room_walls (
  room_id uuid not null references public.rooms (id) on delete cascade,
  wall_id uuid not null references public.walls (id) on delete cascade,
  primary key (room_id, wall_id)
);

comment on table public.room_walls is 'Réservé : murs qui bordent une pièce (relation plusieurs-à-plusieurs, Room.wallIds).';

-- la clé primaire couvre les recherches par room_id ; celles par wall_id ont besoin de leur propre index
create index room_walls_wall_id_idx on public.room_walls (wall_id);

create table public.furniture_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  category public.furniture_category not null,
  label text not null,
  position_x double precision not null,
  position_y double precision not null,
  rotation double precision not null default 0,
  width_m double precision not null check (width_m > 0),
  height_m double precision not null check (height_m > 0)
);

comment on table public.furniture_items is 'Réservé (second œuvre) : meubles et équipements. L''inventaire est calculé, jamais stocké.';

create index furniture_items_plan_id_idx on public.furniture_items (plan_id);

create table public.technical_symbols (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  type public.technical_symbol_type not null,
  position_x double precision not null,
  position_y double precision not null
);

comment on table public.technical_symbols is 'Réservé (second œuvre) : prises, interrupteurs, points lumineux, arrivées et évacuations d''eau.';

create index technical_symbols_plan_id_idx on public.technical_symbols (plan_id);

create table public.finishes (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  floor_texture text,
  wall_color text
);

comment on table public.finishes is 'Réservé (second œuvre) : revêtements d''une pièce, au plus un par pièce.';

-- ---------------------------------------------------------------------------------------------------------
-- Sécurité : RLS
--
-- `plans` compare user_id à auth.uid() (dans un select pour n'évaluer la fonction qu'une fois par requête).
-- Chaque autre table se rattache à son parent par une sous-requête ; comme la RLS du parent s'applique aussi
-- à cette sous-requête, la propriété se propage du plan jusqu'aux ouvertures sans être recopiée partout.
-- `for all` + `with check` : on ne peut ni lire, ni écrire, ni déplacer une ligne vers le plan de quelqu'un d'autre.
-- ---------------------------------------------------------------------------------------------------------

alter table public.plans enable row level security;

create policy "Les utilisateurs gèrent leurs plans"
  on public.plans
  for all
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

-- Tables rattachées directement à un plan
alter table public.terrains enable row level security;
create policy "Accès via le plan" on public.terrains for all to authenticated
  using ( exists (select 1 from public.plans p where p.id = terrains.plan_id) )
  with check ( exists (select 1 from public.plans p where p.id = terrains.plan_id) );

alter table public.houses enable row level security;
create policy "Accès via le plan" on public.houses for all to authenticated
  using ( exists (select 1 from public.plans p where p.id = houses.plan_id) )
  with check ( exists (select 1 from public.plans p where p.id = houses.plan_id) );

alter table public.rooms enable row level security;
create policy "Accès via le plan" on public.rooms for all to authenticated
  using ( exists (select 1 from public.plans p where p.id = rooms.plan_id) )
  with check ( exists (select 1 from public.plans p where p.id = rooms.plan_id) );

alter table public.walls enable row level security;
create policy "Accès via le plan" on public.walls for all to authenticated
  using ( exists (select 1 from public.plans p where p.id = walls.plan_id) )
  with check ( exists (select 1 from public.plans p where p.id = walls.plan_id) );

alter table public.furniture_items enable row level security;
create policy "Accès via le plan" on public.furniture_items for all to authenticated
  using ( exists (select 1 from public.plans p where p.id = furniture_items.plan_id) )
  with check ( exists (select 1 from public.plans p where p.id = furniture_items.plan_id) );

alter table public.technical_symbols enable row level security;
create policy "Accès via le plan" on public.technical_symbols for all to authenticated
  using ( exists (select 1 from public.plans p where p.id = technical_symbols.plan_id) )
  with check ( exists (select 1 from public.plans p where p.id = technical_symbols.plan_id) );

-- Tables rattachées au terrain
alter table public.terrain_points enable row level security;
create policy "Accès via le terrain" on public.terrain_points for all to authenticated
  using ( exists (select 1 from public.terrains t where t.id = terrain_points.terrain_id) )
  with check ( exists (select 1 from public.terrains t where t.id = terrain_points.terrain_id) );

alter table public.roads enable row level security;
create policy "Accès via le terrain" on public.roads for all to authenticated
  using ( exists (select 1 from public.terrains t where t.id = roads.terrain_id) )
  with check ( exists (select 1 from public.terrains t where t.id = roads.terrain_id) );

alter table public.terrain_gates enable row level security;
create policy "Accès via le terrain" on public.terrain_gates for all to authenticated
  using ( exists (select 1 from public.terrains t where t.id = terrain_gates.terrain_id) )
  with check ( exists (select 1 from public.terrains t where t.id = terrain_gates.terrain_id) );

-- Tables rattachées à la base de la maison
alter table public.house_openings enable row level security;
create policy "Accès via la base de la maison" on public.house_openings for all to authenticated
  using ( exists (select 1 from public.houses h where h.id = house_openings.house_id) )
  with check ( exists (select 1 from public.houses h where h.id = house_openings.house_id) );

-- Tables rattachées à une pièce
alter table public.room_openings enable row level security;
create policy "Accès via la pièce" on public.room_openings for all to authenticated
  using ( exists (select 1 from public.rooms r where r.id = room_openings.room_id) )
  with check ( exists (select 1 from public.rooms r where r.id = room_openings.room_id) );

alter table public.room_removed_walls enable row level security;
create policy "Accès via la pièce" on public.room_removed_walls for all to authenticated
  using ( exists (select 1 from public.rooms r where r.id = room_removed_walls.room_id) )
  with check ( exists (select 1 from public.rooms r where r.id = room_removed_walls.room_id) );

alter table public.finishes enable row level security;
create policy "Accès via la pièce" on public.finishes for all to authenticated
  using ( exists (select 1 from public.rooms r where r.id = finishes.room_id) )
  with check ( exists (select 1 from public.rooms r where r.id = finishes.room_id) );

-- Tables rattachées à un mur
alter table public.wall_openings enable row level security;
create policy "Accès via le mur" on public.wall_openings for all to authenticated
  using ( exists (select 1 from public.walls w where w.id = wall_openings.wall_id) )
  with check ( exists (select 1 from public.walls w where w.id = wall_openings.wall_id) );

-- Liaison pièce <-> mur : les DEUX côtés doivent appartenir à l'utilisateur
alter table public.room_walls enable row level security;
create policy "Accès via la pièce et le mur" on public.room_walls for all to authenticated
  using (
    exists (select 1 from public.rooms r where r.id = room_walls.room_id)
    and exists (select 1 from public.walls w where w.id = room_walls.wall_id)
  )
  with check (
    exists (select 1 from public.rooms r where r.id = room_walls.room_id)
    and exists (select 1 from public.walls w where w.id = room_walls.wall_id)
  );

-- ---------------------------------------------------------------------------------------------------------
-- Droits d'accès à l'API : réservés aux utilisateurs connectés (jamais `anon`)
-- ---------------------------------------------------------------------------------------------------------

revoke all on
  public.plans, public.terrains, public.terrain_points, public.roads, public.terrain_gates,
  public.houses, public.house_openings, public.rooms, public.room_openings, public.room_removed_walls,
  public.walls, public.wall_openings, public.room_walls,
  public.furniture_items, public.technical_symbols, public.finishes
from anon;

grant select, insert, update, delete on
  public.plans, public.terrains, public.terrain_points, public.roads, public.terrain_gates,
  public.houses, public.house_openings, public.rooms, public.room_openings, public.room_removed_walls,
  public.walls, public.wall_openings, public.room_walls,
  public.furniture_items, public.technical_symbols, public.finishes
to authenticated;

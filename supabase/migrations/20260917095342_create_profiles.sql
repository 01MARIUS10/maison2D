-- Table profil utilisateur (nom, ville, pays, mail), liée 1:1 à auth.users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nom text not null,
  ville text not null,
  pays text not null,
  mail text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Les utilisateurs lisent leur propre profil"
  on public.profiles
  for select
  to authenticated
  using ( (select auth.uid()) = id );

create policy "Les utilisateurs modifient leur propre profil"
  on public.profiles
  for update
  to authenticated
  using ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

grant select, update on public.profiles to authenticated;

-- Crée automatiquement le profil à l'inscription, à partir des métadonnées
-- passées dans supabase.auth.signUp({ options: { data: { nom, ville, pays } } }).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nom, ville, pays, mail)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', ''),
    coalesce(new.raw_user_meta_data ->> 'ville', ''),
    coalesce(new.raw_user_meta_data ->> 'pays', ''),
    new.email
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

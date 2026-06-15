-- Phase 4 : pseudos publics + amis + parties partagées entre comptes
-- À exécuter une seule fois dans Supabase → SQL Editor.

-- 1) Profils publics : un pseudo unique par compte
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_key
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

create policy "profiles_select_authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- 2) Amitiés (demande / acceptation)
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id)
);

alter table public.friendships enable row level security;

create policy "friendships_select_involved" on public.friendships
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "friendships_insert_requester" on public.friendships
  for insert with check (auth.uid() = requester_id);
create policy "friendships_update_involved" on public.friendships
  for update using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "friendships_delete_involved" on public.friendships
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- 3) Rattacher une ligne de partie au compte d'un ami
alter table public.game_players
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists game_players_user_idx on public.game_players (user_id);

-- Un participant (par son compte) peut lire ses lignes et la partie associée
create policy "game_players_select_participant" on public.game_players
  for select using (auth.uid() = user_id);
create policy "games_select_participant" on public.games
  for select using (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = games.id and gp.user_id = auth.uid()
    )
  );

-- L'hôte ne peut attribuer une ligne qu'à lui-même ou à un ami accepté
drop policy if exists "game_players_insert_own" on public.game_players;
create policy "game_players_insert_own" on public.game_players
  for insert with check (
    auth.uid() = owner_id
    and (
      user_id is null
      or user_id = auth.uid()
      or exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and (
            (f.requester_id = auth.uid() and f.addressee_id = user_id)
            or (f.addressee_id = auth.uid() and f.requester_id = user_id)
          )
      )
    )
  );

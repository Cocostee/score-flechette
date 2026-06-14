-- Schéma de la base "Sur la Ligne" (à exécuter dans Supabase → SQL Editor)
-- Sécurité : Row Level Security, chaque utilisateur ne voit que ses données.

-- Profils joueurs suivis par un compte (famille / potes)
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.players enable row level security;

create policy "players_select_own" on public.players
  for select using (auth.uid() = owner_id);
create policy "players_insert_own" on public.players
  for insert with check (auth.uid() = owner_id);
create policy "players_update_own" on public.players
  for update using (auth.uid() = owner_id);
create policy "players_delete_own" on public.players
  for delete using (auth.uid() = owner_id);

-- Parties terminées
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  mode text not null,
  rules jsonb,
  legs_target int not null default 1,
  winner_player_id uuid references public.players (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.games enable row level security;

create policy "games_select_own" on public.games
  for select using (auth.uid() = owner_id);
create policy "games_insert_own" on public.games
  for insert with check (auth.uid() = owner_id);
create policy "games_delete_own" on public.games
  for delete using (auth.uid() = owner_id);

-- Une ligne par participant à une partie (profil suivi ou invité)
create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  player_id uuid references public.players (id) on delete set null,
  guest_name text,
  placement int,
  legs_won int not null default 0,
  darts int not null default 0,
  points_scored int not null default 0,
  best_visit int not null default 0,
  avg3 numeric,
  marks int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.game_players enable row level security;

create policy "game_players_select_own" on public.game_players
  for select using (auth.uid() = owner_id);
create policy "game_players_insert_own" on public.game_players
  for insert with check (auth.uid() = owner_id);
create policy "game_players_delete_own" on public.game_players
  for delete using (auth.uid() = owner_id);

create index if not exists players_owner_idx on public.players (owner_id);
create index if not exists games_owner_idx on public.games (owner_id);
create index if not exists game_players_owner_idx on public.game_players (owner_id);
create index if not exists game_players_player_idx on public.game_players (player_id);

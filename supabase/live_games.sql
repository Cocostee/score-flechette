-- Phase 6 : spectateur en direct — l'hôte publie l'état, les amis regardent.
-- À exécuter une seule fois dans Supabase → SQL Editor.

create table if not exists public.live_games (
  host_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  status text not null default 'live',  -- 'live' | 'ended'
  updated_at timestamptz not null default now()
);

alter table public.live_games enable row level security;

-- L'hôte n'écrit que sa propre ligne
create policy "live_games_insert_host" on public.live_games
  for insert with check (auth.uid() = host_id);
create policy "live_games_update_host" on public.live_games
  for update using (auth.uid() = host_id)
  with check (auth.uid() = host_id);
create policy "live_games_delete_host" on public.live_games
  for delete using (auth.uid() = host_id);

-- Lecture : l'hôte, ou un ami accepté de l'hôte (même règle que l'attribution de stats)
create policy "live_games_select_friend" on public.live_games
  for select using (
    auth.uid() = host_id
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = host_id)
          or (f.addressee_id = auth.uid() and f.requester_id = host_id)
        )
    )
  );

create index if not exists live_games_updated_idx on public.live_games (updated_at);

-- Realtime : diffuser les changements (idempotent)
do $$
begin
  alter publication supabase_realtime add table public.live_games;
exception
  when duplicate_object then null;
end $$;

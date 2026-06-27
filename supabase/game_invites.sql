-- Phase 5 : invitations à une partie (consentement de l'ami avant rattachement)
-- À exécuter une seule fois dans Supabase → SQL Editor.

create table if not exists public.game_invites (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id) on delete cascade,
  guest_id uuid not null references auth.users (id) on delete cascade,
  mode text not null,
  status text not null default 'pending',  -- pending | accepted | declined | cancelled
  created_at timestamptz not null default now()
);

alter table public.game_invites enable row level security;

-- Les deux parties voient l'invitation
create policy "game_invites_select_involved" on public.game_invites
  for select using (auth.uid() = host_id or auth.uid() = guest_id);

-- Seul l'hôte crée, et uniquement vers un ami accepté (même règle que l'attribution de stats)
create policy "game_invites_insert_host" on public.game_invites
  for insert with check (
    auth.uid() = host_id
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = guest_id)
          or (f.addressee_id = auth.uid() and f.requester_id = guest_id)
        )
    )
  );

-- L'invité passe à accepted/declined, l'hôte à cancelled
create policy "game_invites_update_involved" on public.game_invites
  for update using (auth.uid() = host_id or auth.uid() = guest_id);

create policy "game_invites_delete_involved" on public.game_invites
  for delete using (auth.uid() = host_id or auth.uid() = guest_id);

create index if not exists game_invites_guest_idx on public.game_invites (guest_id, status);
create index if not exists game_invites_host_idx on public.game_invites (host_id, status);

-- Realtime : diffuser les changements de cette table (idempotent)
do $$
begin
  alter publication supabase_realtime add table public.game_invites;
exception
  when duplicate_object then null;
end $$;

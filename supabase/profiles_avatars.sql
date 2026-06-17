-- Phase 5 : photo de profil + consultation des stats d'un ami
-- À exécuter une seule fois dans Supabase → SQL Editor.

-- 1) Avatar : URL publique stockée sur le profil
alter table public.profiles add column if not exists avatar_url text;

-- 2) Bucket de stockage public pour les avatars
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "avatars_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3) Lecture sécurisée des stats d'un ami (uniquement si amitié acceptée)
create or replace function public.friend_stat_rows(target uuid)
returns table (
  placement int,
  avg3 numeric,
  points_scored int,
  best_visit int,
  marks int,
  mode text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select gp.placement, gp.avg3, gp.points_scored, gp.best_visit, gp.marks,
         g.mode, g.created_at
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  where gp.user_id = target
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = target)
          or (f.addressee_id = auth.uid() and f.requester_id = target)
        )
    );
$$;

grant execute on function public.friend_stat_rows(uuid) to authenticated;

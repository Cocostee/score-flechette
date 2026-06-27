# Système d'invitation à une partie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quand l'hôte ajoute le compte d'un ami à une partie, l'ami reçoit une invitation à confirmer ; chez l'hôte le slot reste « en attente » et le départ est bloqué jusqu'à acceptation.

**Architecture:** Une table `game_invites` (Supabase) porte la demande. Deux abonnements Supabase Realtime : l'hôte écoute ses propres invites (pour débloquer le départ à l'acceptation), l'invité écoute les invites qui le visent (pour afficher une bannière instantanée, app ouverte). L'attribution réelle des stats reste inchangée — l'invite n'est qu'une couche de consentement produit qui conditionne le rattachement du slot.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript strict, CSS Modules, `@supabase/supabase-js` (client navigateur déjà en place via `getSupabase()`).

## Global Constraints

- `.env.local` ne doit JAMAIS être commité (déjà gitignored).
- Les migrations SQL DDL sont exécutées par l'UTILISATEUR dans Supabase (la clé publishable navigateur ne peut pas exécuter de DDL). Aucune commande `supabase` CLI.
- `getSupabase()` peut renvoyer `null` (non configuré / SSR) : tout accès data doit dégrader proprement (no-op ou retour d'erreur), comme `src/lib/social.ts`.
- TypeScript strict : aucun `any` implicite, tous les champs typés.
- Le repo n'a PAS de runner de tests automatisés. La vérification de chaque tâche = `npx tsc --noEmit` (zéro sortie = succès) + `npm run build` sur les tâches UI. Le flux temps réel se vérifie manuellement avec deux comptes amis (voir section finale).
- Messages de commit terminés par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Le `GameMode` inclut désormais `"aroundclock"` en plus de `"x01" | "cricket" | "cutthroat"`.

---

## File Structure

| Fichier | Statut | Responsabilité |
|---|---|---|
| `supabase/game_invites.sql` | créé | Table `game_invites` + RLS + publication realtime |
| `src/lib/gameInvites.ts` | créé | Accès données : CRUD + abonnement realtime |
| `src/hooks/useGameInvites.ts` | créé | Côté hôte : invites de la config courante |
| `src/hooks/useIncomingInvites.ts` | créé | Côté invité : écoute globale + accept/decline |
| `src/components/social/InviteBanner.tsx` | créé | Modal d'invitation (portail) |
| `src/components/social/InviteBanner.module.css` | créé | Styles de la modal |
| `src/components/GameApp.tsx` | modifié | Monte l'écoute invité + rend `InviteBanner` |
| `src/components/screens/SetupScreen.tsx` | modifié | Chip → invite, slot « en attente », départ bloqué, annulation, nettoyage |
| `src/components/screens/SetupScreen.module.css` | modifié | Styles statut invite + message + launch désactivé |

---

## Task 1: Migration SQL `game_invites`

**Files:**
- Create: `supabase/game_invites.sql`

**Interfaces:**
- Produces: la table `public.game_invites (id, host_id, guest_id, mode, status, created_at)` lue/écrite par `src/lib/gameInvites.ts` (Task 2).

- [ ] **Step 1: Créer le fichier de migration**

Create `supabase/game_invites.sql` :

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/game_invites.sql
git commit -m "feat: migration table game_invites + RLS + realtime

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Demander à l'utilisateur d'exécuter la migration**

Indiquer à l'utilisateur : « Exécute `supabase/game_invites.sql` dans Supabase → SQL Editor avant de tester le flux temps réel. » (Étape manuelle — l'agent ne peut pas l'exécuter.)

---

## Task 2: Couche données `lib/gameInvites.ts`

**Files:**
- Create: `src/lib/gameInvites.ts`

**Interfaces:**
- Consumes: `getSupabase()` de `src/lib/supabase.ts` ; `GameMode` de `src/interfaces`.
- Produces :
  - `interface GameInvite { id: string; hostId: string; guestId: string; hostUsername: string; mode: GameMode; status: "pending" | "accepted" | "declined" | "cancelled" }`
  - `interface InviteChange { id: string; hostId: string; guestId: string; mode: GameMode; status: GameInvite["status"] }`
  - `createInvite(hostId, guestId, mode): Promise<{ id: string | null; error: string | null }>`
  - `acceptInvite(id): Promise<void>` / `declineInvite(id): Promise<void>` / `cancelInvite(id): Promise<void>`
  - `cancelPendingForHost(hostId): Promise<void>`
  - `listHostInvites(hostId): Promise<GameInvite[]>` (statuts pending+accepted)
  - `listIncomingInvites(guestId): Promise<GameInvite[]>` (pending, < 10 min, avec username hôte)
  - `subscribeInvites(column: "host_id" | "guest_id", userId, onChange: (c: InviteChange | null) => void): () => void`

- [ ] **Step 1: Écrire le module complet**

Create `src/lib/gameInvites.ts` :

```ts
import type { GameMode } from "@/interfaces";
import { getSupabase } from "@/lib/supabase";

export interface GameInvite {
  id: string;
  hostId: string;
  guestId: string;
  hostUsername: string;
  mode: GameMode;
  status: "pending" | "accepted" | "declined" | "cancelled";
}

export interface InviteChange {
  id: string;
  hostId: string;
  guestId: string;
  mode: GameMode;
  status: GameInvite["status"];
}

interface InviteRow {
  id: string;
  host_id: string;
  guest_id: string;
  mode: string;
  status: string;
}

/* Crée une invitation en attente vers un ami ; renvoie l'id ou un message d'erreur. */
export async function createInvite(
  hostId: string,
  guestId: string,
  mode: GameMode,
): Promise<{ id: string | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { id: null, error: "Service indisponible" };
  }
  const { data, error } = await supabase
    .from("game_invites")
    .insert({ host_id: hostId, guest_id: guestId, mode })
    .select("id")
    .single();
  if (error || !data) {
    return { id: null, error: error?.message ?? "Échec de l'invitation" };
  }
  return { id: data.id as string, error: null };
}

/* Met à jour le statut d'une invitation. */
async function setStatus(id: string, status: GameInvite["status"]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }
  await supabase.from("game_invites").update({ status }).eq("id", id);
}

export const acceptInvite = (id: string): Promise<void> => setStatus(id, "accepted");
export const declineInvite = (id: string): Promise<void> => setStatus(id, "declined");
export const cancelInvite = (id: string): Promise<void> => setStatus(id, "cancelled");

/* Annule toutes les invitations encore en attente émises par un hôte (nettoyage). */
export async function cancelPendingForHost(hostId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }
  await supabase
    .from("game_invites")
    .update({ status: "cancelled" })
    .eq("host_id", hostId)
    .eq("status", "pending");
}

/* Liste les invitations actives (pending/accepted) émises par l'hôte. */
export async function listHostInvites(hostId: string): Promise<GameInvite[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }
  const { data } = await supabase
    .from("game_invites")
    .select("id, host_id, guest_id, mode, status")
    .eq("host_id", hostId)
    .in("status", ["pending", "accepted"]);
  const rows = (data as InviteRow[] | null) ?? [];
  return rows.map((r) => ({
    id: r.id,
    hostId: r.host_id,
    guestId: r.guest_id,
    hostUsername: "",
    mode: r.mode as GameMode,
    status: r.status as GameInvite["status"],
  }));
}

/* Liste les invitations en attente adressées à l'invité (récentes), avec le pseudo de l'hôte. */
export async function listIncomingInvites(guestId: string): Promise<GameInvite[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("game_invites")
    .select("id, host_id, guest_id, mode, status")
    .eq("guest_id", guestId)
    .eq("status", "pending")
    .gt("created_at", tenMinAgo)
    .order("created_at", { ascending: false });
  const rows = (data as InviteRow[] | null) ?? [];
  if (rows.length === 0) {
    return [];
  }
  const hostIds = [...new Set(rows.map((r) => r.host_id))];
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", hostIds);
  const names = new Map(
    ((profs as { id: string; username: string }[] | null) ?? []).map((p) => [
      p.id,
      p.username,
    ]),
  );
  return rows.map((r) => ({
    id: r.id,
    hostId: r.host_id,
    guestId: r.guest_id,
    hostUsername: names.get(r.host_id) ?? "?",
    mode: r.mode as GameMode,
    status: r.status as GameInvite["status"],
  }));
}

/* S'abonne en temps réel aux changements d'invitations pour un host_id ou guest_id donné.
   Renvoie une fonction de désabonnement. */
export function subscribeInvites(
  column: "host_id" | "guest_id",
  userId: string,
  onChange: (change: InviteChange | null) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }
  const channel = supabase
    .channel(`game_invites:${column}:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_invites",
        filter: `${column}=eq.${userId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as InviteRow | undefined;
        if (!row) {
          onChange(null);
          return;
        }
        onChange({
          id: row.id,
          hostId: row.host_id,
          guestId: row.guest_id,
          mode: row.mode as GameMode,
          status: row.status as GameInvite["status"],
        });
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
```

- [ ] **Step 2: Vérifier le typage**

Run: `npx tsc --noEmit`
Expected: aucune sortie (succès).

- [ ] **Step 3: Commit**

```bash
git add src/lib/gameInvites.ts
git commit -m "feat: couche données invitations de partie

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Hook hôte `useGameInvites`

**Files:**
- Create: `src/hooks/useGameInvites.ts`

**Interfaces:**
- Consumes: `createInvite`, `cancelInvite`, `cancelPendingForHost`, `listHostInvites`, `subscribeInvites`, `GameInvite` de `src/lib/gameInvites.ts` ; `GameMode` de `src/interfaces`.
- Produces :
  - `interface HostInviteEntry { inviteId: string; status: GameInvite["status"] }`
  - `interface HostInvitesState { invites: Record<string, HostInviteEntry>; invite: (guestId: string, mode: GameMode) => Promise<string | null>; cancelForGuest: (guestId: string) => Promise<void>; cancelAll: () => Promise<void>; hasPending: boolean }`
  - `useGameInvites(userId: string | null): HostInvitesState` — `invites` est indexé par `guestId`.

- [ ] **Step 1: Écrire le hook**

Create `src/hooks/useGameInvites.ts` :

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameMode } from "@/interfaces";
import {
  cancelInvite,
  cancelPendingForHost,
  createInvite,
  listHostInvites,
  subscribeInvites,
  type GameInvite,
} from "@/lib/gameInvites";

export interface HostInviteEntry {
  inviteId: string;
  status: GameInvite["status"];
}

export interface HostInvitesState {
  invites: Record<string, HostInviteEntry>;
  invite: (guestId: string, mode: GameMode) => Promise<string | null>;
  cancelForGuest: (guestId: string) => Promise<void>;
  cancelAll: () => Promise<void>;
  hasPending: boolean;
}

/* Côté hôte : suit les invitations de la config courante, indexées par guestId. */
export function useGameInvites(userId: string | null): HostInvitesState {
  const [invites, setInvites] = useState<Record<string, HostInviteEntry>>({});

  useEffect(() => {
    if (!userId) {
      setInvites({});
      return;
    }
    let active = true;
    void listHostInvites(userId).then((rows) => {
      if (!active) {
        return;
      }
      const map: Record<string, HostInviteEntry> = {};
      for (const r of rows) {
        map[r.guestId] = { inviteId: r.id, status: r.status };
      }
      setInvites(map);
    });
    const unsub = subscribeInvites("host_id", userId, (change) => {
      if (!change) {
        return;
      }
      setInvites((m) => ({
        ...m,
        [change.guestId]: { inviteId: change.id, status: change.status },
      }));
    });
    return () => {
      active = false;
      unsub();
    };
  }, [userId]);

  const invite = useCallback(
    async (guestId: string, mode: GameMode): Promise<string | null> => {
      if (!userId) {
        return "Non connecté";
      }
      const { id, error } = await createInvite(userId, guestId, mode);
      if (error || !id) {
        return error ?? "Échec de l'invitation";
      }
      setInvites((m) => ({
        ...m,
        [guestId]: { inviteId: id, status: "pending" },
      }));
      return null;
    },
    [userId],
  );

  const cancelForGuest = useCallback(
    async (guestId: string): Promise<void> => {
      let inviteId: string | undefined;
      setInvites((m) => {
        inviteId = m[guestId]?.inviteId;
        const next = { ...m };
        delete next[guestId];
        return next;
      });
      if (inviteId) {
        await cancelInvite(inviteId);
      }
    },
    [],
  );

  const cancelAll = useCallback(async (): Promise<void> => {
    if (userId) {
      await cancelPendingForHost(userId);
    }
    setInvites({});
  }, [userId]);

  const hasPending = Object.values(invites).some((e) => e.status === "pending");

  return { invites, invite, cancelForGuest, cancelAll, hasPending };
}
```

- [ ] **Step 2: Vérifier le typage**

Run: `npx tsc --noEmit`
Expected: aucune sortie.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useGameInvites.ts
git commit -m "feat: hook hôte useGameInvites

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Hook invité + bannière

**Files:**
- Create: `src/hooks/useIncomingInvites.ts`
- Create: `src/components/social/InviteBanner.tsx`
- Create: `src/components/social/InviteBanner.module.css`

**Interfaces:**
- Consumes: `acceptInvite`, `declineInvite`, `listIncomingInvites`, `subscribeInvites`, `GameInvite` de `src/lib/gameInvites.ts` ; `getMode` de `src/data/modes.ts`.
- Produces :
  - `interface IncomingInvitesState { current: GameInvite | null; accept: () => Promise<void>; decline: () => Promise<void> }`
  - `useIncomingInvites(userId: string | null): IncomingInvitesState`
  - `InviteBanner({ invite, onAccept, onDecline }: { invite: GameInvite; onAccept: () => void; onDecline: () => void })`

- [ ] **Step 1: Écrire le hook invité**

Create `src/hooks/useIncomingInvites.ts` :

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  acceptInvite,
  declineInvite,
  listIncomingInvites,
  subscribeInvites,
  type GameInvite,
} from "@/lib/gameInvites";

export interface IncomingInvitesState {
  current: GameInvite | null;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
}

/* Côté invité : écoute globale des invitations entrantes ; expose la plus récente. */
export function useIncomingInvites(userId: string | null): IncomingInvitesState {
  const [current, setCurrent] = useState<GameInvite | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) {
      setCurrent(null);
      return;
    }
    const list = await listIncomingInvites(userId);
    setCurrent(list[0] ?? null);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setCurrent(null);
      return;
    }
    let active = true;
    void refresh();
    const unsub = subscribeInvites("guest_id", userId, () => {
      if (active) {
        void refresh();
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, [userId, refresh]);

  const accept = useCallback(async (): Promise<void> => {
    if (!current) {
      return;
    }
    await acceptInvite(current.id);
    setCurrent(null);
    await refresh();
  }, [current, refresh]);

  const decline = useCallback(async (): Promise<void> => {
    if (!current) {
      return;
    }
    await declineInvite(current.id);
    setCurrent(null);
    await refresh();
  }, [current, refresh]);

  return { current, accept, decline };
}
```

- [ ] **Step 2: Écrire la bannière**

Create `src/components/social/InviteBanner.tsx` :

```tsx
"use client";

import { createPortal } from "react-dom";
import type { GameInvite } from "@/lib/gameInvites";
import { getMode } from "@/data/modes";
import styles from "./InviteBanner.module.css";

interface InviteBannerProps {
  invite: GameInvite;
  onAccept: () => void;
  onDecline: () => void;
}

/* Modal affichée à l'invité quand un ami l'invite à rejoindre une partie. */
export function InviteBanner({ invite, onAccept, onDecline }: InviteBannerProps) {
  if (typeof document === "undefined") {
    return null;
  }
  const modeName = getMode(invite.mode).name;
  return createPortal(
    <div className={styles.backdrop}>
      <div
        className={styles.panel}
        role="alertdialog"
        aria-modal="true"
        aria-label="Invitation à une partie"
      >
        <p className={styles.kicker}>Invitation</p>
        <h2 className={styles.title}>
          @{invite.hostUsername} t&apos;invite à une partie
        </h2>
        <p className={styles.mode}>{modeName}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.decline} onClick={onDecline}>
            Refuser
          </button>
          <button type="button" className={styles.accept} onClick={onAccept}>
            Rejoindre
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 3: Écrire les styles (calqués sur ConfirmDialog, z-index 95 pour passer au-dessus de tout)**

Create `src/components/social/InviteBanner.module.css` :

```css
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(8, 6, 3, 0.82);
  backdrop-filter: blur(5px);
  animation: rise 0.2s ease both;
}

.panel {
  width: 100%;
  max-width: 360px;
  text-align: center;
  padding: 28px 24px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--gold);
  background: linear-gradient(180deg, var(--surface-2), var(--surface));
  box-shadow: var(--shadow);
  animation: popIn 0.25s ease both;
}

.kicker {
  margin: 0 0 8px;
  font-size: 0.7rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--gold);
}

.title {
  margin: 0;
  font-size: 1.5rem;
  color: var(--chalk);
  line-height: 1.1;
}

.mode {
  margin: 8px 0 22px;
  font-family: var(--font-display), serif;
  font-size: 1.3rem;
  letter-spacing: 0.05em;
  color: var(--gold-bright);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.decline {
  padding: 14px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: transparent;
  color: var(--chalk);
  font-size: 1rem;
  font-weight: 600;
  transition: all 0.14s ease;
}

.decline:hover {
  border-color: var(--red);
  color: var(--red);
}

.accept {
  padding: 14px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(180deg, var(--green), var(--green-deep));
  color: #fff;
  font-family: var(--font-display), serif;
  font-size: 1.25rem;
  letter-spacing: 0.04em;
  transition: filter 0.14s ease;
}

.accept:hover {
  filter: brightness(1.08);
}
```

- [ ] **Step 4: Vérifier le typage et le build**

Run: `npx tsc --noEmit && npm run build`
Expected: typage sans sortie, build « Compiled successfully ».

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useIncomingInvites.ts src/components/social/InviteBanner.tsx src/components/social/InviteBanner.module.css
git commit -m "feat: hook invité + bannière d'invitation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Montage global dans `GameApp`

**Files:**
- Modify: `src/components/GameApp.tsx`

**Interfaces:**
- Consumes: `useIncomingInvites` (Task 4), `InviteBanner` (Task 4), `useAuth` (existant).

- [ ] **Step 1: Importer le hook et le composant**

Dans `src/components/GameApp.tsx`, ajouter après la ligne `import { useGameRecorder } ...` :

```tsx
import { useIncomingInvites } from "@/hooks/useIncomingInvites";
import { InviteBanner } from "@/components/social/InviteBanner";
```

- [ ] **Step 2: Appeler le hook dans le composant**

Juste après `useGameRecorder(game, user?.id ?? null);`, ajouter :

```tsx
  const incoming = useIncomingInvites(user?.id ?? null);
```

- [ ] **Step 3: Rendre la bannière**

Dans le JSX, à l'intérieur de `<div className={styles.app}>`, juste après le `<div className={styles.frame}>...</div>` fermant, ajouter :

```tsx
      {incoming.current && (
        <InviteBanner
          invite={incoming.current}
          onAccept={incoming.accept}
          onDecline={incoming.decline}
        />
      )}
```

Le bloc final doit ressembler à :

```tsx
  return (
    <div className={styles.app}>
      <div className={styles.frame}>
        {screen === "home" && <HomeScreen game={game} />}
        {screen === "setup" && <SetupScreen game={game} />}
        {screen === "game" && <GameScreen game={game} />}
        {screen === "result" && <ResultScreen game={game} />}
      </div>
      {incoming.current && (
        <InviteBanner
          invite={incoming.current}
          onAccept={incoming.accept}
          onDecline={incoming.decline}
        />
      )}
    </div>
  );
```

- [ ] **Step 4: Vérifier le build**

Run: `npx tsc --noEmit && npm run build`
Expected: succès.

- [ ] **Step 5: Commit**

```bash
git add src/components/GameApp.tsx
git commit -m "feat: monte l'écoute d'invitations + bannière dans GameApp

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Intégration SetupScreen (hôte)

**Files:**
- Modify: `src/components/screens/SetupScreen.tsx`
- Modify: `src/components/screens/SetupScreen.module.css`

**Interfaces:**
- Consumes: `useGameInvites` (Task 3).

Cette tâche modifie SetupScreen : le chip d'un ami crée une invitation (au lieu d'un rattachement instantané), le slot affiche « en attente… » puis « ✓ », un refus retire le slot avec un message, le départ est bloqué tant qu'une invite est en attente, et quitter la config annule les invites en attente. Le chip « Moi » (propre compte) reste instantané.

- [ ] **Step 1: Mettre à jour les imports**

Remplacer `import { useState } from "react";` par :

```tsx
import { useEffect, useRef, useState } from "react";
```

Ajouter après `import { useSocial } from "@/hooks/useSocial";` :

```tsx
import { useGameInvites } from "@/hooks/useGameInvites";
```

- [ ] **Step 2: Instancier le hook et l'état du message**

Après la ligne `const social = useSocial(auth.user?.id ?? null);`, ajouter :

```tsx
  const invites = useGameInvites(auth.user?.id ?? null);
```

Après `const [legsTarget, setLegsTarget] = useState(1);`, ajouter :

```tsx
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const playersRef = useRef(players);
  playersRef.current = players;
```

- [ ] **Step 3: Remplacer `addFriendSlot` par la version avec invitation**

Remplacer toute la fonction `addFriendSlot` existante par :

```tsx
  const addFriendSlot = async (friendUserId: string, label: string) => {
    const isSelf = friendUserId === auth.user?.id;
    const canAdd =
      players.length < MAX_PLAYERS &&
      !players.some((player) => player.friendUserId === friendUserId);
    if (!canAdd) {
      return;
    }
    const newId = crypto.randomUUID();
    setPlayers((list) => {
      const slot = list.find(
        (player) => !player.profileId && !player.friendUserId && !player.name.trim(),
      );
      if (slot) {
        return list.map((player) =>
          player.id === slot.id
            ? { ...player, name: label, friendUserId }
            : player,
        );
      }
      return [...list, { id: newId, name: label, friendUserId }];
    });
    if (!isSelf) {
      const error = await invites.invite(friendUserId, mode);
      if (error) {
        setPlayers((list) =>
          list.filter((player) => player.friendUserId !== friendUserId),
        );
        setInviteMsg(error);
      }
    }
  };
```

- [ ] **Step 4: Mettre à jour `removePlayer` pour annuler l'invitation**

Remplacer la fonction `removePlayer` existante par :

```tsx
  const removePlayer = (id: string) => {
    const target = players.find((player) => player.id === id);
    if (target?.friendUserId && target.friendUserId !== auth.user?.id) {
      void invites.cancelForGuest(target.friendUserId);
    }
    setPlayers((list) =>
      list.length <= MIN_PLAYERS
        ? list
        : list.filter((player) => player.id !== id),
    );
  };
```

- [ ] **Step 5: Ajouter l'effet de détection des refus**

Juste après la définition de `removePlayer`, ajouter :

```tsx
  useEffect(() => {
    const declinedIds = Object.entries(invites.invites)
      .filter(([, entry]) => entry.status === "declined")
      .map(([guestId]) => guestId);
    if (declinedIds.length === 0) {
      return;
    }
    const removed = playersRef.current.filter(
      (player) =>
        player.friendUserId && declinedIds.includes(player.friendUserId),
    );
    if (removed.length === 0) {
      return;
    }
    setInviteMsg(`${removed[0].name} a refusé l'invitation`);
    setPlayers((list) =>
      list.filter(
        (player) =>
          !(player.friendUserId && declinedIds.includes(player.friendUserId)),
      ),
    );
    for (const guestId of declinedIds) {
      void invites.cancelForGuest(guestId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invites.invites]);
```

- [ ] **Step 6: Afficher l'état d'invitation dans la ligne joueur**

Dans le `.map` des `players`, repérer le bouton `removePlayer` (bouton `−` avec `aria-label="Retirer"`). Juste AVANT ce bouton, insérer l'indicateur de statut :

```tsx
              {player.friendUserId && player.friendUserId !== auth.user?.id && (
                <span
                  className={styles.inviteStatus}
                  data-status={invites.invites[player.friendUserId]?.status ?? "pending"}
                >
                  {invites.invites[player.friendUserId]?.status === "accepted"
                    ? "✓"
                    : "en attente…"}
                </span>
              )}
```

- [ ] **Step 7: Afficher le message d'invitation**

Juste après la fermeture du `<div className={styles.players}>` (la liste des lignes joueurs), avant le bouton « + Ajouter un invité », insérer :

```tsx
        {inviteMsg && <p className={styles.inviteMsg}>{inviteMsg}</p>}
```

- [ ] **Step 8: Annuler les invitations au retour accueil**

Remplacer le bouton retour de l'en-tête :

```tsx
        <button type="button" className={styles.back} onClick={game.goHome}>
          <IconArrowLeft /> Retour
        </button>
```

par :

```tsx
        <button
          type="button"
          className={styles.back}
          onClick={async () => {
            await invites.cancelAll();
            game.goHome();
          }}
        >
          <IconArrowLeft /> Retour
        </button>
```

- [ ] **Step 9: Bloquer le départ tant qu'une invitation est en attente**

Remplacer le bouton de lancement :

```tsx
      <button type="button" className={styles.launch} onClick={launch}>
        Lancer la partie
      </button>
```

par :

```tsx
      <button
        type="button"
        className={styles.launch}
        disabled={invites.hasPending}
        onClick={launch}
      >
        {invites.hasPending ? "En attente d'acceptation…" : "Lancer la partie"}
      </button>
```

- [ ] **Step 10: Ajouter les styles**

Dans `src/components/screens/SetupScreen.module.css`, ajouter à la fin :

```css
.inviteStatus {
  flex-shrink: 0;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--gold);
  white-space: nowrap;
}

.inviteStatus[data-status="pending"] {
  color: var(--chalk-dim);
  animation: invitePulse 1.3s ease-in-out infinite;
}

.inviteStatus[data-status="accepted"] {
  color: var(--green);
  font-weight: 700;
}

@keyframes invitePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.inviteMsg {
  margin: 4px 0 0;
  font-size: 0.82rem;
  color: var(--red);
  text-align: center;
}

.launch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 11: Vérifier le typage et le build**

Run: `npx tsc --noEmit && npm run build`
Expected: typage sans sortie, build « Compiled successfully ».

- [ ] **Step 12: Commit**

```bash
git add src/components/screens/SetupScreen.tsx src/components/screens/SetupScreen.module.css
git commit -m "feat: invitations dans la config — slot en attente, départ bloqué

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Vérification manuelle finale (deux comptes)

Le flux temps réel n'est pas reproductible dans le preview local sans deux sessions authentifiées. Après déploiement (push sur `main` → Vercel) et exécution de `supabase/game_invites.sql` :

1. **Pré-requis** : deux comptes A (hôte) et B (invité), amis acceptés, chacun avec un pseudo. Ouvrir A et B dans deux navigateurs/onglets distincts (ou un en navigation privée), B sur l'écran d'accueil app ouverte.
2. **Invitation** : sur A, choisir un mode → écran de config → cliquer le chip `@B` dans « Comptes (stats partagées) ». Vérifier : slot `@B` affiche « en attente… », bouton « Lancer la partie » désactivé et libellé « En attente d'acceptation… ».
3. **Réception** : sur B, vérifier qu'une bannière « @A t'invite à une partie » + nom du mode apparaît en quelques secondes.
4. **Acceptation** : cliquer « Rejoindre » sur B → la bannière disparaît ; sur A, le slot passe à « ✓ » et « Lancer la partie » se réactive.
5. **Refus** : relancer une invitation, cliquer « Refuser » sur B → sur A, le slot `@B` disparaît avec le message « @B a refusé l'invitation ».
6. **Annulation hôte** : inviter `@B`, puis sur A retirer le slot (bouton `−`) ou cliquer « Retour » → sur B (si bannière affichée) elle disparaît.
7. **Attribution** : avec `@B` accepté, lancer et terminer une partie sur A → vérifier que la partie remonte dans les stats de B (« Mes stats »).

---

## Self-Review (effectuée à l'écriture)

- **Couverture spec** : table+RLS+realtime (Task 1) ✓ ; couche données (Task 2) ✓ ; flux hôte (Task 3, 6) ✓ ; flux invité + bannière (Task 4, 5) ✓ ; départ bloqué (Task 6 step 9) ✓ ; refus → slot retiré (Task 6 step 5) ✓ ; annulation/nettoyage au retour (Task 6 step 8 + `cancelPendingForHost`) ✓ ; filtre fraîcheur 10 min (Task 2 `listIncomingInvites`) ✓ ; « Moi » instantané (Task 6 step 3, branche `isSelf`) ✓.
- **Cohérence des types** : `GameInvite`/`InviteChange`/`HostInviteEntry` définis en Task 2/3 et réutilisés à l'identique ; `subscribeInvites(column, userId, onChange)` signature unique consommée par les deux hooks ; `invites.invites` indexé par `guestId` partout.
- **Pas de placeholder** : tout le code est complet et exécutable.

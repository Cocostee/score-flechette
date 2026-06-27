# Système d'invitation à une partie — Design

**Date** : 2026-06-27
**App** : Sur la Ligne (compteur de fléchettes, Next.js 16 / React 19 / TypeScript strict, offline-first, Supabase backend)

## Problème

Aujourd'hui, dans l'écran de configuration d'une partie, l'hôte peut rattacher
le compte d'un ami à un slot joueur **instantanément, sans le consentement de
l'ami**. Les stats lui sont attribuées à la fin de la partie via les règles RLS
existantes (parce qu'ils sont amis acceptés).

L'objectif : transformer ce rattachement en un **vrai système d'invitation**.
Quand l'hôte ajoute un ami à la partie, l'ami reçoit une demande de confirmation
sur son compte. Chez l'hôte, le slot reste « en attente » jusqu'à ce que l'ami
accepte.

## Décisions cadrées (issues du brainstorming)

1. **Démarrage bloqué** : le bouton « Lancer la partie » reste désactivé tant
   qu'au moins une invitation est en attente. L'hôte doit attendre l'acceptation.
2. **Réception instantanée, app ouverte** : l'ami doit avoir l'app ouverte. Une
   bannière « X t'invite à une partie » apparaît en quasi temps réel via Supabase
   Realtime. Pas de notifications push (hors scope).
3. **Refus / annulation → slot retiré** : sur refus de l'ami, le slot est retiré
   de la config avec un message. L'hôte peut annuler une invitation en attente à
   tout moment, ce qui retire le slot.

## Architecture

### Modèle de données — nouvelle table `game_invites`

```sql
game_invites
  id          uuid primary key default gen_random_uuid()
  host_id     uuid not null references auth.users(id) on delete cascade
  guest_id    uuid not null references auth.users(id) on delete cascade
  mode        text not null                     -- GameMode (x01 | cricket | cutthroat | aroundclock)
  status      text not null default 'pending'  -- pending | accepted | declined | cancelled
  created_at  timestamptz not null default now()
```

**Politiques RLS :**

- **select** : `auth.uid() = host_id or auth.uid() = guest_id` (les deux parties
  voient l'invite).
- **insert** : `auth.uid() = host_id` **et** `guest_id` est un ami accepté de
  l'hôte (réutilise exactement la condition de la policy
  `game_players_insert_own` existante : il existe une `friendships` `accepted`
  entre les deux).
- **update** : impliqué (`host_id` ou `guest_id`). Au niveau applicatif :
  l'invité écrit `accepted`/`declined`, l'hôte écrit `cancelled`.
- **delete** : impliqué.

**Realtime** : la table est ajoutée à la publication `supabase_realtime` pour
que les abonnements `postgres_changes` fonctionnent.

**Important** : l'attribution réelle des stats ne change pas — elle reste gérée
à l'enregistrement de la partie par la RLS `game_players_insert_own` existante.
La table `game_invites` est une **couche de consentement produit** : un slot
n'est rattaché au compte d'un ami que si l'invite associée est `accepted`. Aucun
changement à `recordGame` ni à `summarizeGame` n'est nécessaire — le slot porte
toujours `friendUserId` une fois l'invite acceptée, et le reste du pipeline
fonctionne tel quel.

### Les deux flux temps réel

**Côté hôte (SetupScreen)** — hook `useGameInvites(userId)` :

1. Clic sur le chip d'un ami → `createInvite(host_id, guest_id, mode)` insère une
   ligne `pending`, et ajoute le slot joueur localement à l'état « en attente ».
2. Le hook s'abonne en Realtime aux invites où `host_id = userId`.
3. Quand l'invité répond :
   - `accepted` → le slot passe « en attente » → « accepté », `friendUserId` est
     confirmé, le départ se débloque si plus aucune invite n'est `pending`.
   - `declined` → le slot est retiré, message « @pote a refusé ».

**Côté invité (global, monté dans `GameApp`)** — hook `useIncomingInvites(userId)` :

1. S'abonne en Realtime aux invites `pending` où `guest_id = userId`.
2. Filtre les invites « récentes » (`created_at > now() - 10 min`) au chargement
   initial pour éviter d'afficher des invites fantômes laissées par un hôte qui
   aurait fermé l'app brutalement.
3. Expose l'invite en cours + `accept()` / `decline()`.
4. Le composant `InviteBanner` (modal) s'affiche : « **@hôte t'invite à une
   partie** » + le nom du mode via `getMode(invite.mode).name` (ex. « Cricket »,
   « 301 / 501 »), avec boutons Accepter / Refuser. Le champ stocké est `mode`
   (le `GameMode`), pas le score de départ.

### Changements UI (SetupScreen)

- Le chip ami ne rattache plus instantanément : il déclenche `createInvite`.
- Le slot joueur correspondant affiche un état **« en attente… »** (pulse/spinner)
  puis **« ✓ accepté »**.
- Un bouton **annuler** sur un slot en attente passe l'invite à `cancelled` et
  retire le slot.
- **« Lancer la partie »** est désactivé tant qu'au moins une invite est
  `pending`, avec un libellé explicite (« En attente de @pote… »).
- Le chip **« Moi »** (le propre compte de l'hôte) reste instantané — pas
  d'invitation à soi-même.

### Cycle de vie & cas limites

- **Refus** → slot retiré + message « @pote a refusé ».
- **Annulation hôte** ou **quitter la config** (retour accueil / `goHome`) → les
  invites encore `pending` passent à `cancelled` (nettoyage) → la bannière
  disparaît chez l'invité.
- **Invité déjà en partie** sur son propre téléphone : la bannière s'affiche
  quand même ; il peut ignorer ou refuser.
- Pas de push, pas de timeout automatique au-delà du filtre de fraîcheur en
  lecture.
- **Service Supabase indisponible** (`getSupabase()` renvoie null) : les
  fonctions `lib/gameInvites.ts` dégradent proprement (no-op / retour d'erreur),
  comme le reste de `lib/social.ts`. Hors-ligne, le système d'invitation est
  simplement inactif et les chips amis sont masqués (déjà le cas : ils
  n'apparaissent que si `auth.user`).

## Découpage en unités

| Fichier | Statut | Rôle |
|---|---|---|
| `supabase/game_invites.sql` | nouveau | table + RLS + publication realtime (exécuté par l'utilisateur dans Supabase) |
| `src/lib/gameInvites.ts` | nouveau | CRUD (`createInvite`, `acceptInvite`, `declineInvite`, `cancelInvite`, `listIncomingInvites`) + helpers d'abonnement Realtime |
| `src/hooks/useGameInvites.ts` | nouveau | côté hôte : gère les invites de la config courante, statut par ami, abonnement realtime |
| `src/hooks/useIncomingInvites.ts` | nouveau | côté invité : écoute globale, invite courante + accept/decline |
| `src/components/social/InviteBanner.tsx` (+ `.module.css`) | nouveau | modal d'invitation côté invité |
| `src/components/screens/SetupScreen.tsx` | modifié | chip → invite, slot « en attente », launch bloqué, annulation |
| `src/components/GameApp.tsx` | modifié | monte `useIncomingInvites` + rend `InviteBanner` |

### Interfaces clés

```ts
// lib/gameInvites.ts
export interface GameInvite {
  id: string;
  hostId: string;
  guestId: string;
  hostUsername: string;   // résolu via profiles, pour la bannière
  mode: GameMode;
  status: "pending" | "accepted" | "declined" | "cancelled";
}

export async function createInvite(hostId, guestId, mode): Promise<{ id: string } | { error: string }>;
export async function acceptInvite(id): Promise<void>;
export async function declineInvite(id): Promise<void>;
export async function cancelInvite(id): Promise<void>;
export async function listIncomingInvites(guestId): Promise<GameInvite[]>;
// subscribeHostInvites(hostId, cb) / subscribeGuestInvites(guestId, cb) → renvoient une fonction de désabonnement

// hooks/useGameInvites.ts (hôte)
interface HostInviteState {
  invites: Record<string /*guestId*/, { inviteId: string; status: GameInvite["status"] }>;
  invite: (guestId: string, mode: GameMode) => Promise<string | null>; // retourne erreur ou null
  cancel: (guestId: string) => Promise<void>;
  cancelAll: () => Promise<void>;          // au démontage / goHome
  hasPending: boolean;                     // pour bloquer le launch
}

// hooks/useIncomingInvites.ts (invité)
interface IncomingInviteState {
  current: GameInvite | null;              // invite pending la plus récente
  accept: () => Promise<void>;
  decline: () => Promise<void>;
}
```

## Stratégie de test / vérification

- **Type-check + build** (`npx tsc --noEmit`, `npm run build`) — gate de base.
- **Vérification manuelle réelle** : nécessite deux comptes authentifiés et amis
  (la RLS et le Realtime ne sont pas reproductibles dans le preview local sans
  session). Le flux complet (invite → bannière → accept → déblocage) se teste en
  conditions réelles après déploiement, avec deux navigateurs/comptes.
- Pas de tests unitaires automatisés pré-existants dans le repo ; on reste sur
  type-check + build + vérification manuelle, cohérent avec l'existant.

## Hors scope

- Notifications push (app fermée).
- Timeout/expiration automatique côté serveur.
- Jeu interactif synchrone (l'invité ne score pas sur son tél — l'hôte score
  localement, l'invite n'est qu'un consentement).
- Durcissement supplémentaire de la RLS d'attribution de stats (inchangée).

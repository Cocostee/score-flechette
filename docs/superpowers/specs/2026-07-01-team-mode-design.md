# Mode Équipes (2v2, 3v3, 2v2v2…) — Design

**Date** : 2026-07-01
**App** : Sur la Ligne (compteur de fléchettes, Next.js 16 / React 19 / TypeScript strict, offline-first, CSS Modules, Supabase backend)

## Problème

Le moteur de jeu est entièrement individuel : le score, la rotation des tours,
la condition de victoire et les stats sont indexés par joueur. On veut ajouter
un **jeu en équipe** (2v2, 3v3, 2v2v2, et formats personnalisés) pour tous les
modes, avec une UX simple de création d'équipes.

## Décisions cadrées (brainstorming)

1. **Score partagé, lancers alternés** (le vrai mode « doubles »). Une équipe
   partage UN score ; les coéquipiers lancent à tour de rôle en alternant entre
   équipes : `A1 → B1 → A2 → B2 → A1…`. Chaque volée s'applique au score commun
   de l'équipe.
2. **Tous les modes** : X01, Cricket, Cut-Throat, Autour de l'horloge. Chaque
   équipe partage un état de jeu commun.
3. **UX config** : sélecteur Individuel / Équipes, presets rapides
   (2v2, 3v3, 2v2v2) + bouton « + » pour personnaliser (ajouter/retirer des
   équipes), cartes d'équipe à remplir.
4. **Comptes liés + stats individuelles** : profils/amis (et invitations)
   peuvent occuper les slots d'équipe ; à la fin, chaque joueur reçoit ses stats
   perso + le résultat de son équipe dans son historique.
5. **Noms d'équipe éditables** (défaut « Équipe A / B / C », renommables).

## Architecture

### Le modèle « côtés » (side)

Introduction de la notion de **côté** (`side`) = l'unité qui marque un score :

- **Solo** : chaque joueur est son propre côté → `sideId === playerId`.
  Comportement identique à l'existant, 100 % rétro-compatible.
- **Équipe** : le côté = l'équipe → `sideId === teamId`. Le score partagé
  (`states`), les manches gagnées (`legsWon`) et le vainqueur sont indexés par
  `teamId`.

Ajouts à `GameState` :

```ts
interface Team {
  id: string;
  name: string;        // "Équipe A" par défaut, éditable
  playerIds: string[]; // membres, dans l'ordre de lancer interne à l'équipe
  color: string;       // clé de couleur d'équipe (accent UI)
}

// nouveaux champs GameState :
teams: Team[] | null;             // null = mode individuel
sideOf: Record<string, string>;   // playerId -> sideId (identité en solo)
order: string[];                  // ordre de lancer (playerIds), interleavé
// states, legsWon : désormais indexés par sideId (== playerId en solo)
// winnerId : sémantique = sideId gagnant (nom conservé)
```

En solo, `teams = null`, `sideOf` est l'identité, `order` = les joueurs dans
l'ordre → aucun changement de comportement.

**Réutilisation** : les fonctions de scoring existantes (`applyX01Dart`,
`applyCricketDart`, `checkCricketWin`, `deadNumbers`, ATC `applyAroundClockDart`)
sont réutilisées telles quelles — on leur passe l'état du **côté** au lieu de
l'état du joueur. Un helper `stateForPlayer(state, playerId)` renvoie
`state.states[state.sideOf?.[playerId] ?? playerId]` pour les consommateurs UI.

### Nouveau util `src/utils/teams.ts`

- `buildOrder(teams: Team[]): string[]` — construit l'ordre de lancer interleavé.
  Round-robin par index de position : pour chaque `i` de 0 à `maxTeamSize-1`,
  pour chaque équipe, prendre `team.playerIds[i % team.playerIds.length]`. Pour
  des équipes égales (2v2, 3v3) donne l'alternance propre `A1,B1,A2,B2`. Pour des
  équipes inégales, les plus petites cyclent.
- `buildSideOf(teams: Team[]): Record<string, string>` — map playerId → teamId.
- `DEFAULT_TEAM_COLORS: string[]` — palette de clés de couleur (accent par équipe).
- `teamLabel(index): string` — « Équipe A », « Équipe B »…

### Reducer (`useDartsGame.ts`)

- Le joueur courant = `order[currentIndex]` ; son côté = `sideOf[currentPlayerId]`
  (ou `currentPlayerId` en solo).
- `REGISTER_DART` applique les fléchettes à `states[currentSideId]`. Victoire →
  `winnerId = currentSideId`, `legsWon[currentSideId]++`.
- `NEXT_TURN` : `currentIndex = (currentIndex + 1) % order.length` ; le round
  incrémente quand on repasse au `startIndex`. Stats attribuées au joueur courant
  (par `playerId`), inchangé.
- `START_GAME` : construit `teams`, `sideOf`, `order`, et `states`/`legsWon`
  indexés par `sideId`. En solo, `order = players.map(p => p.id)`,
  `sideOf = identité`, `teams = null`.
- `NEXT_LEG` / `NEW_GAME` : rebâtissent les états par côté ; `startIndex` tourne
  d'un cran par manche.
- `HYDRATE` : rétro-compat — une partie sauvegardée sans `teams`/`sideOf`/`order`
  est traitée comme solo (`teams = null`, `sideOf` identité,
  `order = players.map(p => p.id)`).

Le bust X01 revient au `turnSnapshot` du côté courant (comme aujourd'hui, mais
indexé par sideId).

### Condition de victoire par mode (côté)

Inchangée dans sa logique, appliquée au côté : X01 → score du côté à 0 (règle
out) ; Cricket/Cut-Throat → `checkCricketWin` sur les côtés ; ATC → cible du côté
au-delà du Bull. `deadNumbers` (cricket) est calculé sur l'ensemble des côtés.

## UX

### Config (SetupScreen)

- **Sélecteur Individuel / Équipes** en tête de la section joueurs.
- Mode Équipes :
  - Boutons rapides **2v2 · 3v3 · 2v2v2 · +**. Un preset génère les cartes
    d'équipe pré-dimensionnées. « + » ajoute une équipe vide.
  - **Carte d'équipe** (couleur d'accent distincte) : titre **éditable**
    (input, défaut « Équipe A »), ses slots joueurs (invité, profil ⭐ ou ami 👤,
    mêmes chips + invitations qu'en solo), bouton retirer un joueur, bouton
    retirer l'équipe.
  - Contraintes : 2–3 équipes, total ≤ 6 joueurs, chaque équipe ≥ 1 joueur.
  - **Lancer bloqué** si une équipe est vide, ou si une invitation d'ami est en
    attente (réutilise `useGameInvites.hasPending`).
- Bascule Individuel → Équipes : les joueurs déjà saisis sont répartis dans une
  première équipe ; Équipes → Individuel revient à la liste à plat.

### En jeu (GameScreen + PlayerScoreCard)

- **Une carte par équipe** (nouveau composant `TeamScoreCard`) : gros score
  partagé au centre ; en dessous, les mini-lignes des coéquipiers (nom + leurs
  fléchettes du tour / dernière volée). La carte de l'équipe courante est mise en
  avant ; le **lanceur courant** est surligné (liseré doré). Couleur d'accent de
  l'équipe cohérente. En mode solo, `GameScreen` continue d'utiliser
  `PlayerScoreCard` inchangé.
- L'en-tête de tour affiche « [Équipe] — [Joueur] » et le total de la volée.
- En solo, l'affichage reste exactement l'actuel (carte = joueur).

### Résultat (ResultScreen)

- **Podium par équipe** (Or/Argent/Bronze). Chaque carte d'équipe liste ses
  joueurs avec le détail perso (moy/3, meilleure volée, fléchettes, 180s/checkout).
- En solo, inchangé.

## Stats & enregistrement

Chaque volée appartient à un joueur → stats perso exactes par joueur (déjà le
cas dans le reducer). À l'enregistrement (`gameSummary.ts` / `recordGame`) :
**une ligne `game_players` par joueur** (profil/ami/invité) portant ses stats
individuelles + la **place et les manches de son équipe**. Le classement des
côtés est calculé par `ranking.ts` (adapté pour ranker des côtés, avec la même
logique par mode). Aucun changement de schéma SQL : les colonnes existantes
(`placement`, `legs_won`, `darts`, `points_scored`, `best_visit`, `avg3`,
`marks`, `user_id`, `player_id`, `guest_name`) suffisent.

## Découpage en unités / fichiers

| Fichier | Statut | Rôle |
|---|---|---|
| `src/utils/teams.ts` | nouveau | `buildOrder`, `buildSideOf`, couleurs, labels |
| `src/interfaces/index.ts` | modifié | `Team` + champs `teams`/`sideOf`/`order` |
| `src/hooks/useDartsGame.ts` | modifié | rotation/scoring/victoire/legs par côté + HYDRATE rétro-compat |
| `src/utils/ranking.ts` | modifié | classement par côté |
| `src/utils/gameSummary.ts` | modifié | lignes par joueur avec place/manches d'équipe |
| `src/components/screens/SetupScreen.tsx` (+ CSS) | modifié | toggle, presets, cartes d'équipe éditables |
| `src/components/screens/GameScreen.tsx` (+ CSS) | modifié | branche solo/équipe, lanceur courant |
| `src/components/ui/TeamScoreCard.tsx` (+ CSS) | nouveau | carte d'équipe (score partagé + mini-lignes joueurs) ; `PlayerScoreCard` reste inchangé et sert le mode solo |
| `src/components/screens/ResultScreen.tsx` (+ CSS) | modifié | podium par équipe |

## Stratégie de vérification

- `npx tsc --noEmit` (zéro sortie) + `npm run build` (« Compiled successfully »)
  à chaque étape — gate de base (pas de runner de tests dans le repo).
- Vérification manuelle : lancer une partie 2v2 X01 (alternance des lanceurs,
  score partagé, bust, victoire d'équipe), un 2v2v2, un Cricket équipe ; vérifier
  le podium et l'attribution des stats aux comptes liés. Le solo doit rester
  identique (non-régression).

## Hors scope

- Réorganisation drag-and-drop des joueurs entre équipes (on ajoute/retire ;
  pas de glisser-déposer en v1).
- Équipes de plus de 3 joueurs / plus de 3 équipes (cap à 6 joueurs total).
- Handicaps ou scores de départ différents par équipe.
- Changement de schéma Supabase (les colonnes existantes suffisent).

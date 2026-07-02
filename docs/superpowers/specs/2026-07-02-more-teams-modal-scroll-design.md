# Plus d'équipes (jusqu'à 8) + modal compte scrollable — Design

**Date** : 2026-07-02
**App** : Sur la Ligne (Next.js 16 / React 19 / TS strict, CSS Modules)

## Demandes

1. Pouvoir jouer avec **plus d'équipes** (2v2v2v2 et jusqu'à **8 équipes de 2**) —
   aujourd'hui plafonné à 3 équipes / 6 joueurs.
2. Sur **petit téléphone**, le modal du compte déborde et n'est pas scrollable :
   le bas (thème / mode nuit / effets) est inatteignable.

## Décisions

- Plafonds : **8 équipes maximum**, **16 joueurs maximum** (8 × 2). S'applique
  aussi au mode individuel (effet de bord inoffensif).

## Changements

### 1. Plus d'équipes
- `src/utils/teams.ts` : `TEAM_COLORS` passe à **8 clés** (`teamA`…`teamH`),
  `TEAM_LETTERS` à `A`…`H`. `teamColor(i)` cycle déjà (`% length`), donc 8 accents
  distincts.
- `src/components/screens/SetupScreen.tsx` : `MAX_PLAYERS 6 → 16`,
  `MAX_TEAMS 3 → 8` ; ajout du preset **`2v2v2v2`** dans `TEAM_PRESETS`.
- CSS accents équipe (5 nouvelles couleurs D→H) dans
  `src/components/screens/SetupScreen.module.css` et
  `src/components/ui/TeamScoreCard.module.css` (mêmes clés `data-color`).
- Rien d'autre : `buildOrder`, `ranking`, le scoreboard (grille qui wrappe à
  >2 côtés), le slider de config gèrent déjà N équipes ; les labels de rang
  au-delà de la table retombent sur « Ne » via le `?? \`${rank}e\`` existant.

### 2. Modal scrollable
- `src/components/account/AccountButton.module.css` : sur `.panel`, ajouter
  `max-height: calc(100dvh - 36px)` + `overflow-y: auto` (et
  `-webkit-overflow-scrolling: touch`) pour pouvoir scroller jusqu'au thème /
  mode nuit / effets sur petit écran. Le `.backdrop` reste centré ; le panneau
  scrolle en interne.

## Vérification

- `npx tsc --noEmit` + `npm run build`.
- Preview largeur mobile : le modal compte scrolle jusqu'au mode nuit ; en config,
  ajouter jusqu'à 8 équipes / 16 joueurs et lancer un 2v2v2v2.

## Hors scope

- Presets au-delà de 2v2v2v2 (on ajoute les équipes suivantes via « + »).
- Refonte du scoreboard pour très grand nombre de côtés (la grille wrappe déjà).

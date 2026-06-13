import type { GameMode, ModeInfo } from "@/interfaces";

export const MODES: ModeInfo[] = [
  {
    mode: "x01",
    name: "301 / 501",
    tagline: "Tomber pile à zéro",
    rules: [
      "Chaque joueur part d'un capital (301, 501, 701 ou 901) et lance 3 fléchettes par tour.",
      "La somme des points du tour est soustraite du total : le but est d'arriver exactement à zéro.",
      "La bulle extérieure (verte) vaut 25, la bulle centrale (rouge) vaut 50.",
      "Double In : il faut toucher un Double (ou la bulle centrale) pour ouvrir le compteur.",
      "Double Out : la dernière fléchette doit être un Double (ou bulle centrale) pour finir à zéro.",
      "Master Out : on peut finir sur un Double ou un Triple.",
      "Bust : si on dépasse zéro (ou qu'il reste 1 en Double Out), le tour est annulé et le score revient à sa valeur de début de tour.",
    ],
  },
  {
    mode: "cricket",
    name: "Cricket",
    tagline: "Conquérir 15 à 20 + Bulle",
    rules: [
      "Seuls le 15, 16, 17, 18, 19, 20 et la Bulle comptent.",
      "Fermer un numéro demande 3 touches : Simple = 1, Double = 2, Triple = 3, bulle ext. = 1, bulle centrale = 2.",
      "Une fois un numéro fermé, chaque touche supplémentaire rapporte sa valeur en points, tant qu'un adversaire ne l'a pas fermé.",
      "Quand tous les joueurs ont fermé un numéro, il devient mort et ne rapporte plus rien.",
      "Pour gagner : avoir fermé tous ses numéros ET posséder un score supérieur ou égal à celui des adversaires.",
    ],
  },
  {
    mode: "cutthroat",
    name: "Cut-Throat",
    tagline: "Le moins de points possible",
    rules: [
      "Mêmes numéros que le Cricket (15 à 20 + Bulle) et 3 touches pour fermer.",
      "Système inversé : quand vous tirez dans un numéro que vous avez fermé, les points sont infligés aux adversaires qui ne l'ont pas encore fermé.",
      "Un adversaire qui ferme le numéro devient immunisé contre ces points.",
      "Pour gagner : être le premier à fermer tous ses numéros ET avoir le score le plus bas (ou à égalité).",
      "Idéal à 3 ou 4 joueurs : on peut s'allier pour charger le joueur en tête.",
    ],
  },
];

/* Returns the descriptor for a given game mode. */
export function getMode(mode: GameMode): ModeInfo {
  const found = MODES.find((entry) => entry.mode === mode);
  if (!found) {
    return MODES[0];
  }
  return found;
}

export const X01_START_SCORES: number[] = [301, 501, 701, 901];

import type { Multiplier } from "@/interfaces";

export const BOARD_ORDER: number[] = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
];

export const RINGS = {
  bull50: 0.05,
  bull25: 0.11,
  tripleIn: 0.55,
  tripleOut: 0.63,
  doubleIn: 0.9,
  doubleOut: 1,
};

export type RingName = "singleIn" | "triple" | "singleOut" | "double";

export type ZoneBase = "dark" | "light" | "red" | "green";

export interface BoardZone {
  key: string;
  number: number;
  ring: RingName;
  segment: number;
  multiplier: Multiplier;
  base: ZoneBase;
  d: string;
}

export interface Point {
  x: number;
  y: number;
}

/* Converts a board-polar position (degrees clockwise from top) to an x/y point. */
export function pointOnBoard(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
  frac: number,
): Point {
  const t = (angleDeg * Math.PI) / 180;
  return {
    x: cx + Math.sin(t) * radius * frac,
    y: cy - Math.cos(t) * radius * frac,
  };
}

/* Builds the SVG path for one annular sector between two radii fractions. */
function annularSector(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
  fracIn: number,
  fracOut: number,
): string {
  const oStart = pointOnBoard(cx, cy, radius, startDeg, fracOut);
  const oEnd = pointOnBoard(cx, cy, radius, endDeg, fracOut);
  const iEnd = pointOnBoard(cx, cy, radius, endDeg, fracIn);
  const iStart = pointOnBoard(cx, cy, radius, startDeg, fracIn);
  const rOut = radius * fracOut;
  const rIn = radius * fracIn;
  return [
    `M ${oStart.x.toFixed(2)} ${oStart.y.toFixed(2)}`,
    `A ${rOut.toFixed(2)} ${rOut.toFixed(2)} 0 0 1 ${oEnd.x.toFixed(2)} ${oEnd.y.toFixed(2)}`,
    `L ${iEnd.x.toFixed(2)} ${iEnd.y.toFixed(2)}`,
    `A ${rIn.toFixed(2)} ${rIn.toFixed(2)} 0 0 0 ${iStart.x.toFixed(2)} ${iStart.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

/* Builds a full-sector path between two radii, used for cricket overlays. */
export function sectorPath(
  cx: number,
  cy: number,
  radius: number,
  index: number,
  fracIn: number,
  fracOut: number,
): string {
  const center = index * 18;
  return annularSector(cx, cy, radius, center - 9, center + 9, fracIn, fracOut);
}

/* Generates every clickable sector zone of the board (singles, triples, doubles). */
export function buildBoardZones(
  cx: number,
  cy: number,
  radius: number,
): BoardZone[] {
  const zones: BoardZone[] = [];

  BOARD_ORDER.forEach((number, index) => {
    const center = index * 18;
    const start = center - 9;
    const end = center + 9;
    const dark = index % 2 === 0;

    const rings: {
      ring: RingName;
      multiplier: Multiplier;
      fracIn: number;
      fracOut: number;
      base: ZoneBase;
    }[] = [
      {
        ring: "singleIn",
        multiplier: 1,
        fracIn: RINGS.bull25,
        fracOut: RINGS.tripleIn,
        base: dark ? "dark" : "light",
      },
      {
        ring: "triple",
        multiplier: 3,
        fracIn: RINGS.tripleIn,
        fracOut: RINGS.tripleOut,
        base: dark ? "red" : "green",
      },
      {
        ring: "singleOut",
        multiplier: 1,
        fracIn: RINGS.tripleOut,
        fracOut: RINGS.doubleIn,
        base: dark ? "dark" : "light",
      },
      {
        ring: "double",
        multiplier: 2,
        fracIn: RINGS.doubleIn,
        fracOut: RINGS.doubleOut,
        base: dark ? "red" : "green",
      },
    ];

    for (const r of rings) {
      zones.push({
        key: `${number}-${r.ring}`,
        number,
        ring: r.ring,
        segment: number,
        multiplier: r.multiplier,
        base: r.base,
        d: annularSector(cx, cy, radius, start, end, r.fracIn, r.fracOut),
      });
    }
  });

  return zones;
}

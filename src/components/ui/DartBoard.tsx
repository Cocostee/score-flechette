"use client";

import { useMemo } from "react";
import type { Multiplier } from "@/interfaces";
import {
  BOARD_ORDER,
  RINGS,
  buildBoardZones,
  pointOnBoard,
  sectorPath,
} from "@/utils/board";
import styles from "./DartBoard.module.css";

interface CricketOverlay {
  marks: Record<number, number>;
  dead: number[];
}

interface DartBoardProps {
  onThrow: (segment: number, multiplier: Multiplier) => void;
  disabled: boolean;
  cricket?: CricketOverlay;
}

const CX = 210;
const CY = 210;
const R = 170;
const LIVE = new Set([15, 16, 17, 18, 19, 20]);

type NumberState = "open" | "closed" | "dead" | "inactive";

/* Interactive dartboard: tap the exact zone hit, the multiplier is inferred. */
export function DartBoard({ onThrow, disabled, cricket }: DartBoardProps) {
  const zones = useMemo(() => buildBoardZones(CX, CY, R), []);

  const stateOf = (num: number): NumberState => {
    if (!cricket) {
      return "open";
    }
    if (cricket.dead.includes(num)) {
      return "dead";
    }
    if ((cricket.marks[num] ?? 0) >= 3) {
      return "closed";
    }
    return num === 25 || LIVE.has(num) ? "open" : "inactive";
  };

  const overlays = cricket
    ? BOARD_ORDER.map((num, index) => ({ num, index, state: stateOf(num) }))
        .filter((entry) => entry.state === "closed" || entry.state === "dead")
        .map((entry) => ({
          ...entry,
          d: sectorPath(CX, CY, R, entry.index, RINGS.bull25, RINGS.doubleOut),
          mark: pointOnBoard(CX, CY, R, entry.index * 18, 0.74),
        }))
    : [];

  const bullState = stateOf(25);

  return (
    <svg
      viewBox="0 0 420 420"
      className={styles.board}
      data-disabled={disabled ? "true" : "false"}
      role="group"
      aria-label="Cible de fléchettes"
    >
      <circle
        cx={CX}
        cy={CY}
        r={R + 28}
        className={styles.rim}
        onClick={() => onThrow(0, 1)}
      >
        <title>À côté · 0</title>
      </circle>
      <circle
        cx={CX}
        cy={CY}
        r={R + 16}
        className={styles.rimInner}
        onClick={() => onThrow(0, 1)}
      >
        <title>À côté · 0</title>
      </circle>

      <g className={styles.zones}>
        {zones.map((zone) => {
          const num = zone.number;
          const state = cricket ? stateOf(num) : "open";
          return (
            <path
              key={zone.key}
              d={zone.d}
              className={styles.zone}
              data-base={zone.base}
              data-ring={zone.ring}
              data-state={state}
              onClick={() => onThrow(zone.segment, zone.multiplier)}
            >
              <title>
                {zone.multiplier === 3
                  ? "Triple "
                  : zone.multiplier === 2
                    ? "Double "
                    : ""}
                {num}
              </title>
            </path>
          );
        })}
      </g>

      {overlays.map((overlay) => (
        <g key={`ov-${overlay.num}`} className={styles.overlay}>
          <path d={overlay.d} className={styles.overlayPath} data-state={overlay.state} />
          <text
            x={overlay.mark.x}
            y={overlay.mark.y}
            className={styles.overlayMark}
            data-state={overlay.state}
          >
            {overlay.state === "dead" ? "✕" : "✓"}
          </text>
        </g>
      ))}

      <circle
        cx={CX}
        cy={CY}
        r={R * RINGS.bull25}
        className={styles.bullOuter}
        data-state={bullState}
        onClick={() => onThrow(25, 1)}
      >
        <title>Bulle extérieure · 25</title>
      </circle>
      <circle
        cx={CX}
        cy={CY}
        r={R * RINGS.bull50}
        className={styles.bullInner}
        data-state={bullState}
        onClick={() => onThrow(50, 1)}
      >
        <title>Bulle centrale · 50</title>
      </circle>

      <g className={styles.labels}>
        {BOARD_ORDER.map((num, index) => {
          const p = pointOnBoard(CX, CY, R, index * 18, 1.115);
          const state = cricket ? stateOf(num) : "open";
          return (
            <text
              key={`lab-${num}`}
              x={p.x}
              y={p.y}
              className={styles.label}
              data-state={state}
            >
              {num}
            </text>
          );
        })}
      </g>
    </svg>
  );
}

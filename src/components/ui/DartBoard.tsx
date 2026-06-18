"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DartThrow, Multiplier } from "@/interfaces";
import {
  BOARD_ORDER,
  RINGS,
  buildBoardZones,
  markerPoint,
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
  darts?: DartThrow[];
  atcTarget?: number;
}

const CX = 210;
const CY = 210;
const R = 170;
const LIVE = new Set([15, 16, 17, 18, 19, 20]);

type NumberState = "open" | "closed" | "dead" | "inactive";

/* Interactive dartboard: tap the exact zone hit, the multiplier is inferred. */
export function DartBoard({
  onThrow,
  disabled,
  cricket,
  darts = [],
  atcTarget,
}: DartBoardProps) {
  const zones = useMemo(() => buildBoardZones(CX, CY, R), []);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const flash = (key: string) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashKey(key);
    flashTimer.current = setTimeout(() => setFlashKey(null), 420);
  };

  const markers = darts
    .map((dart, index) => {
      const point = markerPoint(CX, CY, R, dart.segment, dart.multiplier);
      return point ? { point, index } : null;
    })
    .filter((entry): entry is { point: { x: number; y: number }; index: number } => entry !== null);

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
        onClick={() => { onThrow(0, 1); flash("miss"); }}
      >
        <title>À côté · 0</title>
      </circle>
      <circle
        cx={CX}
        cy={CY}
        r={R + 16}
        className={styles.rimInner}
        onClick={() => { onThrow(0, 1); flash("miss"); }}
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
              data-flash={flashKey === zone.key ? "true" : undefined}
              data-atctarget={atcTarget !== undefined && atcTarget > 0 && zone.number === atcTarget ? "true" : undefined}
              onClick={() => { onThrow(zone.segment, zone.multiplier); flash(zone.key); }}
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
        data-flash={flashKey === "bull25" ? "true" : undefined}
        data-atctarget={atcTarget === 25 ? "true" : undefined}
        onClick={() => { onThrow(25, 1); flash("bull25"); }}
      >
        <title>Bulle extérieure · 25</title>
      </circle>
      <circle
        cx={CX}
        cy={CY}
        r={R * RINGS.bull50}
        className={styles.bullInner}
        data-state={bullState}
        data-flash={flashKey === "bull50" ? "true" : undefined}
        data-atctarget={atcTarget === 25 ? "true" : undefined}
        onClick={() => { onThrow(50, 1); flash("bull50"); }}
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

      <g className={styles.markers}>
        {markers.map(({ point, index }) => {
          const offset = (index - 1) * 7;
          return (
            <circle
              key={`m-${index}`}
              cx={point.x + offset}
              cy={point.y}
              r={6}
              className={styles.marker}
            />
          );
        })}
      </g>
    </svg>
  );
}

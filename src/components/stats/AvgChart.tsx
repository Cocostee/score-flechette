"use client";

import type { GameMode } from "@/interfaces";
import styles from "./StatsScreen.module.css";

interface ChartPoint {
  date: string;
  avg3: number;
  mode: GameMode;
  won: boolean;
}

interface AvgChartProps {
  series: ChartPoint[];
}

const W = 320;
const H = 130;
const PAD = 14;

/* Renders a compact SVG line chart of the 3-dart average over time. */
export function AvgChart({ series }: AvgChartProps) {
  if (series.length < 2) {
    return (
      <p className={styles.chartEmpty}>
        Joue au moins 2 parties pour voir ta courbe de progression.
      </p>
    );
  }

  const values = series.map((point) => point.avg3);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;

  const x = (index: number) =>
    PAD + (index / (series.length - 1)) * (W - PAD * 2);
  const y = (value: number) =>
    H - PAD - ((value - min) / span) * (H - PAD * 2);

  const line = series
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point.avg3).toFixed(1)}`)
    .join(" ");

  const area = `${line} L ${x(series.length - 1).toFixed(1)} ${H - PAD} L ${x(0).toFixed(1)} ${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img">
      <defs>
        <linearGradient id="avgFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#avgFill)" />
      <path
        d={line}
        fill="none"
        stroke="var(--gold-bright)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {series.map((point, index) => (
        <circle
          key={index}
          cx={x(index)}
          cy={y(point.avg3)}
          r={point.won ? 4 : 2.5}
          fill={point.won ? "var(--green)" : "var(--chalk)"}
          stroke="var(--bg-deep)"
          strokeWidth="1.5"
        />
      ))}
      <text x={PAD} y={11} className={styles.chartTick}>
        {max.toFixed(0)}
      </text>
      <text x={PAD} y={H - 3} className={styles.chartTick}>
        {min.toFixed(0)}
      </text>
    </svg>
  );
}

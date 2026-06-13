"use client";

import { useState } from "react";
import type { Multiplier } from "@/interfaces";
import styles from "./DartPad.module.css";

interface DartPadProps {
  onThrow: (segment: number, multiplier: Multiplier) => void;
  disabled: boolean;
  liveNumbers?: number[];
}

const NUMBERS = Array.from({ length: 20 }, (_, index) => index + 1);

const MODIFIERS: { value: Multiplier; label: string }[] = [
  { value: 1, label: "Simple" },
  { value: 2, label: "Double" },
  { value: 3, label: "Triple" },
];

/* Number-then-modifier input pad emitting a complete dart to the parent. */
export function DartPad({ onThrow, disabled, liveNumbers }: DartPadProps) {
  const [selected, setSelected] = useState<number | null>(null);

  const fire = (segment: number, multiplier: Multiplier) => {
    onThrow(segment, multiplier);
    setSelected(null);
  };

  const pickModifier = (multiplier: Multiplier) => {
    if (selected === null) {
      return;
    }
    fire(selected, multiplier);
  };

  return (
    <div className={styles.pad} data-disabled={disabled ? "true" : "false"}>
      <div className={styles.grid}>
        {NUMBERS.map((number) => {
          const dim = liveNumbers ? !liveNumbers.includes(number) : false;
          return (
            <button
              key={number}
              type="button"
              disabled={disabled}
              className={`${styles.num} ${
                selected === number ? styles.numOn : ""
              } ${dim ? styles.numDim : ""}`}
              onClick={() => setSelected(number)}
            >
              {number}
            </button>
          );
        })}
      </div>

      <div className={styles.bulls}>
        <button
          type="button"
          disabled={disabled}
          className={`${styles.bull} ${styles.bullOuter}`}
          onClick={() => fire(25, 1)}
        >
          25
          <span className={styles.bullSub}>Bulle ext.</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`${styles.bull} ${styles.bullInner}`}
          onClick={() => fire(50, 1)}
        >
          50
          <span className={styles.bullSub}>Bulle centre</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`${styles.bull} ${styles.miss}`}
          onClick={() => fire(0, 1)}
        >
          ✕
          <span className={styles.bullSub}>Manqué</span>
        </button>
      </div>

      <div className={styles.modifiers}>
        {MODIFIERS.map((modifier) => (
          <button
            key={modifier.value}
            type="button"
            disabled={disabled || selected === null}
            className={`${styles.mod} ${styles[`mod${modifier.value}`]}`}
            onClick={() => pickModifier(modifier.value)}
          >
            <span className={styles.modMark}>×{modifier.value}</span>
            {modifier.label}
            {selected !== null && (
              <span className={styles.modValue}>
                {selected * modifier.value}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

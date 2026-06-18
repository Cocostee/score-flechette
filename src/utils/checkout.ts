import type { X01OutOption } from "@/interfaces";

interface DartOption {
  value: number;
  label: string;
  isDouble: boolean;
  isTriple: boolean;
}

const MAX_CHECKOUT = 170;

/* Builds every throwable single-dart option with its label and ring flags. */
function buildOptions(): DartOption[] {
  const options: DartOption[] = [];
  for (let n = 1; n <= 20; n += 1) {
    options.push({ value: n, label: `${n}`, isDouble: false, isTriple: false });
    options.push({ value: n * 2, label: `D${n}`, isDouble: true, isTriple: false });
    options.push({ value: n * 3, label: `T${n}`, isDouble: false, isTriple: true });
  }
  options.push({ value: 25, label: "25", isDouble: false, isTriple: false });
  options.push({ value: 50, label: "Bull", isDouble: true, isTriple: false });
  return options;
}

const ALL = buildOptions();

/* Tells whether a dart may legally close the leg under the out rule. */
function canFinish(option: DartOption, out: X01OutOption): boolean {
  if (out === "open") {
    return true;
  }
  if (out === "master") {
    return option.isDouble || option.isTriple;
  }
  return option.isDouble;
}

/* Recursively searches a finishing route, preferring high setups and clean doubles. */
function solve(
  remaining: number,
  left: number,
  out: X01OutOption,
  finishers: DartOption[],
  setups: DartOption[],
): string[] | null {
  for (const f of finishers) {
    if (f.value === remaining) {
      return [f.label];
    }
  }
  if (left <= 1) {
    return null;
  }
  for (const s of setups) {
    const rest = remaining - s.value;
    if (rest < 2) {
      continue;
    }
    const route = solve(rest, left - 1, out, finishers, setups);
    if (route) {
      return [s.label, ...route];
    }
  }
  return null;
}

/* Suggests a finishing combination for the remaining score, or null if none fits. */
export function suggestCheckout(
  score: number,
  dartsLeft: number,
  out: X01OutOption,
): string[] | null {
  if (score <= 1 || score > MAX_CHECKOUT || dartsLeft <= 0) {
    return null;
  }
  const finishers = ALL.filter((option) => canFinish(option, out)).sort(
    (a, b) => a.value - b.value,
  );
  const setups = [...ALL].sort((a, b) => b.value - a.value);
  return solve(score, dartsLeft, out, finishers, setups);
}

/* Returns up to three distinct finishing routes, varying the first dart each time. */
export function suggestCheckouts(
  score: number,
  dartsLeft: number,
  out: X01OutOption,
): string[][] {
  if (score <= 1 || score > MAX_CHECKOUT || dartsLeft <= 0) {
    return [];
  }
  const finishers = ALL.filter((o) => canFinish(o, out)).sort(
    (a, b) => a.value - b.value,
  );
  const setups = [...ALL].sort((a, b) => b.value - a.value);
  const results: string[][] = [];
  const usedFirst = new Set<string>();

  const base = solve(score, dartsLeft, out, finishers, setups);
  if (base) {
    results.push(base);
    usedFirst.add(base[0]);
  }

  if (dartsLeft <= 1) return results;

  for (const start of setups) {
    if (results.length >= 3) break;
    if (usedFirst.has(start.label)) continue;
    const rest = score - start.value;
    if (rest < 2) continue;
    const tail = solve(rest, dartsLeft - 1, out, finishers, setups);
    if (tail) {
      usedFirst.add(start.label);
      results.push([start.label, ...tail]);
    }
  }

  return results;
}

import type { DistConfig } from "./types";

/** mulberry32 — детерминированный ГПСЧ с seed */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** выборка из распределения (минуты) */
export function sample(dist: DistConfig, rnd: () => number): number {
  switch (dist.kind) {
    case "constant":
      return dist.value ?? 0;
    case "exponential": {
      // метод обратной функции: -mean * ln(1 - U)
      const u = Math.max(rnd(), 1e-12);
      return -(dist.mean ?? 1) * Math.log(1 - u);
    }
    case "uniform": {
      const min = dist.min ?? 0;
      const max = dist.max ?? 1;
      return min + (max - min) * rnd();
    }
    case "triangular": {
      const min = dist.min ?? 0;
      const max = dist.max ?? 1;
      const mode = dist.mode ?? (min + max) / 2;
      const u = rnd();
      const cut = (mode - min) / (max - min);
      if (u < cut) return min + Math.sqrt(u * (max - min) * (mode - min));
      return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
  }
}

export function distLabel(dist: DistConfig): string {
  switch (dist.kind) {
    case "constant":
      return `constant(${dist.value ?? 0})`;
    case "exponential":
      return `exponential(ср. ${dist.mean ?? 0})`;
    case "uniform":
      return `uniform(${dist.min ?? 0}..${dist.max ?? 0})`;
    case "triangular":
      return `triangular(${dist.min ?? 0}, ${dist.mode ?? 0}, ${dist.max ?? 0})`;
  }
}

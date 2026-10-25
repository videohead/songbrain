/** Deterministic pattern selection: variations by weight, fills at section ends. */
import type { Pattern, RolePatterns } from '../../model/style';

/** Stable hash → [0,1). */
export function unit(seed: number, ...parts: number[]): number {
  let h = (seed * 2654435761) >>> 0;
  for (const p of parts) { h ^= (p + 0x9e3779b9 + (h << 6) + (h >>> 2)) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; }
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

export function pickWeighted<H>(patterns: Pattern<H>[], r: number): Pattern<H> | null {
  if (!patterns.length) return null;
  const total = patterns.reduce((s, p) => s + (p.weight ?? 1), 0);
  if (total <= 0) return patterns[0];
  let x = r * total;
  for (const p of patterns) { x -= p.weight ?? 1; if (x < 0) return p; }
  return patterns[patterns.length - 1];
}

export interface MeasureContext {
  /** Global measure index (0-based). */
  measureIndex: number;
  /** Index within its section. */
  indexInSection: number;
  sectionLength: number;
  sectionIndex: number;
  isSongStart: boolean;
  isSongEnd: boolean;
  seed: number;
  fills: boolean;
  defaultBars: number;
}

export interface Chosen<H> { pattern: Pattern<H>; barInPattern: number; kind: 'variation' | 'fill' | 'intro' | 'ending' }

/**
 * Choose the pattern (and which bar of it) for one measure. Multi-bar patterns
 * are chosen once per pattern-length group so their bars stay together.
 */
export function choosePattern<H>(role: RolePatterns<H>, ctx: MeasureContext): Chosen<H> | null {
  const bars = (p: Pattern<H>) => p.bars ?? ctx.defaultBars;
  if (ctx.isSongEnd && role.ending) {
    const b = bars(role.ending);
    return { pattern: role.ending, barInPattern: Math.min(b - 1, ctx.indexInSection % b), kind: 'ending' };
  }
  if (ctx.isSongStart && role.intro && ctx.indexInSection < bars(role.intro)) {
    return { pattern: role.intro, barInPattern: ctx.indexInSection, kind: 'intro' };
  }
  if (ctx.fills && role.fills?.length && ctx.sectionLength > 1) {
    const fill = pickWeighted(role.fills, unit(ctx.seed, 7, ctx.sectionIndex, ctx.sectionLength));
    if (fill) {
      const b = bars(fill);
      const fromEnd = ctx.sectionLength - ctx.indexInSection; // 1 = last bar
      if (fromEnd <= b) return { pattern: fill, barInPattern: b - fromEnd, kind: 'fill' };
    }
  }
  if (!role.variations.length) return null;
  const groupLen = Math.max(1, ...role.variations.map(bars));
  const group = Math.floor(ctx.indexInSection / groupLen);
  const v = pickWeighted(role.variations, unit(ctx.seed, ctx.sectionIndex, group));
  if (!v) return null;
  const b = bars(v);
  return { pattern: v, barInPattern: ctx.indexInSection % b, kind: 'variation' };
}

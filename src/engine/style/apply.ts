/**
 * Feel application: swing, push-pull, accents, humanize. Pure.
 */
import type { Feel } from '../../model/style';
import type { TrackRole } from '../../model/song';

/** Deterministic pseudo-random in [-1, 1) from an integer seed. */
export function jitter(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
}

export interface FeelInput {
  /** Nominal tick of the event. */
  tick: number;
  /** Beat position within its bar (0-based, fractional). */
  beatInBar: number;
  velocity: number;
  role: TrackRole;
  ticksPerBeat: number;
}

export function applyFeel(input: FeelInput, feel: Feel, maxTick: number): { tick: number; velocity: number } {
  let tick = input.tick;
  const frac = input.beatInBar - Math.floor(input.beatInBar);
  // Swing: off-beat 8ths (x.5) move toward the triplet position (x.667).
  if (Math.abs(frac - 0.5) < 1e-6 && feel.swing > 0) tick += feel.swing * (input.ticksPerBeat / 6);
  tick += feel.pushPull + (feel.rolePushPull?.[input.role] ?? 0);
  if (feel.humanize > 0) tick += jitter(input.tick * 31 + input.role.length) * feel.humanize;
  const accent = feel.accents.length ? feel.accents[Math.floor(input.beatInBar) % feel.accents.length] : 1;
  const velocity = Math.max(1, Math.min(127, Math.round(input.velocity * accent)));
  return { tick: Math.max(0, Math.min(maxTick - 1, Math.round(tick))), velocity };
}

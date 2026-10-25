/**
 * MIDI-to-style learner: a rendered performance of a known chord chart → Style.
 *
 * Pipeline: assign tracks to roles → locate the chart (skip count-in) → quantize
 * onsets to a swing-aware grid → classify pitches relative to the chord sounding
 * → emit per-bar patterns, deduplicated into weighted variations → estimate feel
 * (swing, push-pull per role, humanize, accents) → optional ending pattern.
 */
import type { Measure, TrackRole } from '../../model/song';
import type { BassDegree, BassHit, CompHit, DrumHit, Feel, Pattern, Style, Substyle } from '../../model/style';
import { chordTones } from '../voicing';
import type { MidiFile, MidiNote, MidiTrack } from '../import/midiRead';

export interface LearnOptions {
  id: string;
  name: string;
  /** Chart the MIDI was played over, one Measure per bar. */
  chart: Measure[];
  beatsPerBar?: number;
  /** 0-based bar where the chart starts; auto-detected from leading silence when omitted. */
  startBar?: number;
  /** Pattern length in bars (1 or 2). Default 1. */
  patternBars?: number;
  /** Learn into substyle b of an existing style instead of creating a new one. */
  into?: Style;
  substyle?: 'a' | 'b';
  source?: string;
  /** Max variations kept per role (by weight). Default 6. */
  maxVariations?: number;
}

export interface LearnReport {
  roles: Array<{ track: string; role: TrackRole | 'ignored'; notes: number }>;
  startBar: number;
  chartBars: number;
  endingBars: number;
  swing: number;
  pushPullTicks: number;
  humanizeTicks: number;
}

interface RoleTrack { role: TrackRole; notes: MidiNote[]; name: string }

// ---------------------------------------------------------------------------
// Role assignment
// ---------------------------------------------------------------------------

function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; }

export function assignRoles(tracks: MidiTrack[]): Array<{ track: MidiTrack; role: TrackRole | 'ignored' }> {
  return tracks.map((track) => {
    if (!track.notes.length) return { track, role: 'ignored' as const };
    if (track.channel === 10) return { track, role: 'drums' as const };
    const name = track.name.toLowerCase();
    const onsets = new Map<number, number>();
    for (const n of track.notes) onsets.set(n.tick, (onsets.get(n.tick) ?? 0) + 1);
    const polyRatio = [...onsets.values()].filter((c) => c > 1).length / onsets.size;
    const med = median(track.notes.map((n) => n.pitch));
    const bassy = (polyRatio < 0.15 && med < 55) || /bass/.test(name);
    if (/drum|perc/.test(name)) return { track, role: 'drums' as const };
    return { track, role: bassy ? ('bass' as const) : ('chords' as const) };
  });
}

// ---------------------------------------------------------------------------
// Grid & feel
// ---------------------------------------------------------------------------

/** Snap a within-beat fraction to the nearest grid point. Returns {grid, isOffbeat8th}. */
function snap(frac: number): { grid: number; offbeat8: boolean } {
  // Off-beat 8th region covers straight (0.5), triplet (0.667) and hard swing (0.75).
  if (frac >= 0.42 && frac <= 0.84) return { grid: 0.5, offbeat8: true };
  const points = [0, 0.25, 1];
  let best = 0, bd = Infinity;
  for (const p of points) { const d = Math.abs(frac - p); if (d < bd) { bd = d; best = p; } }
  return { grid: best === 1 ? 1 : best, offbeat8: false };
}

interface Quantized { beat: number; residualTicks: number; note: MidiNote }

function quantize(notes: MidiNote[], barStart: number, tpb: number, swingFrac: number): Quantized[] {
  const out: Quantized[] = [];
  for (const n of notes) {
    const pos = (n.tick - barStart) / tpb;
    const whole = Math.floor(pos);
    const { grid, offbeat8 } = snap(pos - whole);
    let beat = whole + grid;
    let expected = beat;
    if (offbeat8) expected = whole + 0.5 + swingFrac / 6;
    if (grid === 1) { beat = whole + 1; expected = beat; }
    out.push({ beat, residualTicks: Math.round((pos - expected) * tpb), note: n });
  }
  return out;
}

function estimateSwing(notes: MidiNote[], tpb: number): number {
  const offs: number[] = [];
  for (const n of notes) { const f = (n.tick % tpb) / tpb; if (f >= 0.42 && f <= 0.84) offs.push(f); }
  if (offs.length < 4) return 0;
  const mean = offs.reduce((a, b) => a + b, 0) / offs.length;
  return Math.max(0, Math.min(1, (mean - 0.5) / (1 / 6)));
}

// ---------------------------------------------------------------------------
// Pitch classification
// ---------------------------------------------------------------------------

function chordAtBeat(chart: Measure[], bar: number, beat: number): { symbol: string; nextSymbol: string | null } {
  const m = chart[bar];
  const next = (b: number, c: number) => chart[b]?.chords[c]?.symbol ?? chart[(b + 1) % chart.length]?.chords[0]?.symbol ?? null;
  if (!m || !m.chords.length) return { symbol: 'N.C.', nextSymbol: null };
  let acc = 0;
  for (let i = 0; i < m.chords.length; i++) {
    acc += m.chords[i].beats;
    if (beat < acc - 1e-6) return { symbol: m.chords[i].symbol, nextSymbol: i + 1 < m.chords.length ? m.chords[i + 1].symbol : next(bar + 1, 0) };
  }
  return { symbol: m.chords[m.chords.length - 1].symbol, nextSymbol: next(bar + 1, 0) };
}

function pcSet(symbol: string): Set<number> {
  const t = chordTones(symbol);
  if (!t) return new Set();
  return new Set([t.root, t.third, t.fifth, t.sixth, t.seventh, t.ninth, t.eleventh, t.thirteenth].filter((x): x is number => x !== undefined));
}

function bassDegree(pitch: number, symbol: string, nextSymbol: string | null, isLastInBar: boolean, barRoot: number | null): BassDegree {
  const t = chordTones(symbol);
  const pc = pitch % 12;
  if (!t) return 'root';
  if (pc === t.root) return barRoot !== null && pitch >= barRoot + 12 ? 'octave' : 'root';
  if (pc === t.third) return 'third';
  if (pc === (t.fifth ?? (t.root + 7) % 12)) return 'fifth';
  const nt = nextSymbol ? chordTones(nextSymbol) : null;
  if (nt && isLastInBar && (Math.abs(((pc - nt.root) % 12 + 12) % 12) === 1 || ((nt.root - pc) % 12 + 12) % 12 === 1)) return 'approach';
  return isLastInBar ? 'approach' : 'fifth';
}

// ---------------------------------------------------------------------------
// Pattern extraction
// ---------------------------------------------------------------------------

const q4 = (x: number) => Math.max(0.25, Math.round(x * 4) / 4);
const sig = (p: Pattern<{ beat: number }>) => JSON.stringify(p.hits);

function dedupe<H extends { beat: number }>(patterns: Pattern<H>[], max: number): Pattern<H>[] {
  const map = new Map<string, Pattern<H>>();
  for (const p of patterns) {
    const k = sig(p);
    const e = map.get(k);
    if (e) e.weight = (e.weight ?? 1) + 1; else map.set(k, { ...p, weight: 1 });
  }
  return [...map.values()].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1)).slice(0, max);
}

export function styleFromMidi(midi: MidiFile, opts: LearnOptions): { style: Style; report: LearnReport } {
  const tpb = midi.ppq;
  const bpb = opts.beatsPerBar ?? midi.timeSignature.beats;
  const tpbar = tpb * bpb;
  const patternBars = opts.patternBars ?? 1;
  const roles = assignRoles(midi.tracks);
  const used: RoleTrack[] = roles.filter((r): r is { track: MidiTrack; role: TrackRole } => r.role !== 'ignored').map((r) => ({ role: r.role, notes: r.track.notes, name: r.track.name.trim() }));
  const allNotes = used.flatMap((r) => r.notes);
  if (!allNotes.length) throw new Error('MIDI file has no notes.');

  const firstTick = Math.min(...allNotes.map((n) => n.tick));
  const startBar = opts.startBar ?? Math.floor((firstTick + tpb * 0.25) / tpbar);
  const chartBars = opts.chart.length;
  const chartStart = startBar * tpbar;
  const chartEnd = chartStart + chartBars * tpbar;
  const lastTick = Math.max(...allNotes.map((n) => n.tick));
  const endingBars = Math.max(0, Math.ceil((lastTick + 1 - chartEnd) / tpbar));

  const swing = estimateSwing(allNotes.filter((n) => n.tick >= chartStart && n.tick < chartEnd), tpb);
  const residualsByRole: Record<string, number[]> = { chords: [], bass: [], drums: [] };
  const velByBeat: number[][] = Array.from({ length: bpb }, () => []);

  const sub: Substyle = {};
  for (const r of used) {
    const perBar = (bar0: number, count: number, collect: (bar: number, q: Quantized[], barIndexInPattern: number) => void) => {
      for (let g = 0; g < count; g += patternBars) {
        for (let b = 0; b < patternBars && g + b < count; b++) {
          const bar = bar0 + g + b;
          const bs = bar * tpbar;
          const q = quantize(r.notes.filter((n) => n.tick >= bs && n.tick < bs + tpbar), bs, tpb, swing);
          collect(g + b, q, b);
        }
      }
    };

    // ---- chart bars → hits per pattern group
    const groups: Map<number, { comp: CompHit[]; bass: BassHit[]; drums: DrumHit[] }> = new Map();
    perBar(startBar, chartBars, (chartBar, q, barInPattern) => {
      const g = Math.floor(chartBar / patternBars);
      const grp = groups.get(g) ?? { comp: [], bass: [], drums: [] };
      groups.set(g, grp);
      for (const x of q) { residualsByRole[r.role].push(x.residualTicks); velByBeat[Math.min(bpb - 1, Math.floor(x.beat))].push(x.note.velocity); }
      const offset = barInPattern * bpb;
      if (r.role === 'drums') {
        for (const x of q) grp.drums.push({ beat: offset + x.beat, duration: q4(x.note.durationTicks / tpb) <= 0.25 ? 0.25 : 0.5, velocity: x.note.velocity, drum: x.note.pitch });
      } else if (r.role === 'bass') {
        const sorted = [...q].sort((a, b) => a.beat - b.beat);
        const barRootPitch = sorted.find((x) => { const t = chordTones(chordAtBeat(opts.chart, chartBar, x.beat).symbol); return t && x.note.pitch % 12 === t.root; })?.note.pitch ?? null;
        sorted.forEach((x, i) => {
          const { symbol, nextSymbol } = chordAtBeat(opts.chart, chartBar, x.beat);
          const degree = bassDegree(x.note.pitch, symbol, nextSymbol, i === sorted.length - 1 && x.beat >= bpb - 1, barRootPitch);
          grp.bass.push({ beat: offset + x.beat, duration: q4(x.note.durationTicks / tpb), velocity: x.note.velocity, degree });
        });
      } else {
        // Group simultaneous notes into one hit.
        const byBeat = new Map<number, Quantized[]>();
        for (const x of q) (byBeat.get(x.beat) ?? byBeat.set(x.beat, []).get(x.beat)!).push(x);
        for (const [beat, xs] of [...byBeat.entries()].sort((a, b) => a[0] - b[0])) {
          const pcs = new Set(xs.map((x) => x.note.pitch % 12));
          const { symbol, nextSymbol } = chordAtBeat(opts.chart, chartBar, beat);
          const cur = pcSet(symbol), nxt = nextSymbol ? pcSet(nextSymbol) : new Set<number>();
          const inCur = [...pcs].filter((p) => cur.has(p)).length, inNext = [...pcs].filter((p) => nxt.has(p)).length;
          const push = nextSymbol && nextSymbol !== symbol && inNext > inCur && beat >= bpb - 1.5 ? Math.round((bpb - beat) * 4) / 4 : undefined;
          const vel = Math.round(xs.reduce((s, x) => s + x.note.velocity, 0) / xs.length);
          const dur = q4(Math.max(...xs.map((x) => x.note.durationTicks)) / tpb);
          let voice: CompHit['voice'] = 'full';
          if (xs.length === 1) voice = xs[0].note.pitch >= 60 ? 'top' : 'bottom';
          grp.comp.push({ beat: offset + beat, duration: dur, velocity: vel, voice, ...(push ? { push } : {}) });
        }
      }
    });
    const patterns = [...groups.values()];
    const bars = patternBars;
    if (r.role === 'drums') {
      const variations = dedupe(patterns.map((p) => ({ hits: p.drums, bars })).filter((p) => p.hits.length), opts.maxVariations ?? 6);
      sub.drums = { variations };
    } else if (r.role === 'bass') {
      const variations = dedupe(patterns.map((p) => ({ hits: p.bass, bars })).filter((p) => p.hits.length), opts.maxVariations ?? 6);
      const density = patterns.reduce((s, p) => s + p.bass.length, 0) / Math.max(1, patterns.length) / bars;
      sub.bass = { style: density >= 3.5 ? 'walking' : density >= 1.5 ? 'roots-fifths' : 'roots', variations };
    } else {
      const variations = dedupe(patterns.map((p) => ({ hits: p.comp, bars })).filter((p) => p.hits.length), opts.maxVariations ?? 6);
      sub.comp = { variations };
    }

    // ---- ending (bars after the chart), as one pattern
    if (endingBars > 0) {
      const endStart = chartEnd;
      const q = quantize(r.notes.filter((n) => n.tick >= endStart && n.tick <= lastTick), endStart, tpb, swing);
      const lastChord = opts.chart[chartBars - 1]?.chords.slice(-1)[0]?.symbol ?? 'C';
      if (q.length) {
        if (r.role === 'drums') sub.drums!.ending = { bars: endingBars, hits: q.map((x) => ({ beat: x.beat, duration: 0.5, velocity: x.note.velocity, drum: x.note.pitch })) };
        else if (r.role === 'bass') sub.bass!.ending = { bars: endingBars, hits: q.map((x) => ({ beat: x.beat, duration: q4(x.note.durationTicks / tpb), velocity: x.note.velocity, degree: bassDegree(x.note.pitch, lastChord, null, false, null) })) };
        else {
          const byBeat = new Map<number, Quantized[]>();
          for (const x of q) (byBeat.get(x.beat) ?? byBeat.set(x.beat, []).get(x.beat)!).push(x);
          sub.comp!.ending = { bars: endingBars, hits: [...byBeat.entries()].sort((a, b) => a[0] - b[0]).map(([beat, xs]) => ({ beat, duration: q4(Math.max(...xs.map((x) => x.note.durationTicks)) / tpb), velocity: Math.round(xs.reduce((s, x) => s + x.note.velocity, 0) / xs.length), voice: xs.length === 1 ? (xs[0].note.pitch >= 60 ? 'top' : 'bottom') : 'full' })) };
        }
      }
    }
  }

  // Clamp hit beats into the pattern length (safety for rounding to the next bar).
  const clamp = <H extends { beat: number }>(role: { variations: Pattern<H>[]; ending?: Pattern<H> } | undefined) => {
    if (!role) return;
    for (const p of [...role.variations, ...(role.ending ? [role.ending] : [])]) {
      const total = (p.bars ?? patternBars) * bpb;
      p.hits = p.hits.filter((h) => h.beat < total - 1e-6);
    }
    role.variations = role.variations.filter((p) => p.hits.length);
  };
  clamp(sub.comp); clamp(sub.bass); clamp(sub.drums);

  // ---- feel
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const sd = (xs: number[]) => { const m = mean(xs); return xs.length ? Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) : 0; };
  const roleMeans = { chords: mean(residualsByRole.chords), bass: mean(residualsByRole.bass), drums: mean(residualsByRole.drums) };
  const global = mean(Object.values(residualsByRole).flat());
  // Scale residual ticks to the engine's PPQ (192) so feel is file-independent.
  const scale = 192 / tpb;
  const beatVel = velByBeat.map((v) => mean(v));
  const maxVel = Math.max(1, ...beatVel);
  const feel: Feel = {
    swing: Math.round(swing * 100) / 100,
    pushPull: Math.round(global * scale),
    humanize: Math.round(sd(Object.values(residualsByRole).flat()) * scale),
    accents: beatVel.map((v) => (v ? Math.round((v / maxVel) * 100) / 100 : 1)),
    rolePushPull: Object.fromEntries((['chords', 'bass', 'drums'] as const).filter((r) => residualsByRole[r].length).map((r) => [r, Math.round((roleMeans[r] - global) * scale)])),
  };

  const which = opts.substyle ?? 'a';
  const style: Style = opts.into
    ? { ...opts.into, substyles: { ...opts.into.substyles, [which]: sub } }
    : { id: opts.id, name: opts.name, description: `Learned from ${opts.source ?? 'MIDI'}`, bars: patternBars, beatsPerBar: bpb, feel, substyles: { a: sub }, source: opts.source };

  return {
    style,
    report: {
      roles: roles.map((r) => ({ track: r.track.name.trim() || '(unnamed)', role: r.role, notes: r.track.notes.length })),
      startBar, chartBars, endingBars, swing: feel.swing, pushPullTicks: feel.pushPull, humanizeTicks: feel.humanize,
    },
  };
}

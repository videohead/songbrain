/**
 * Pure scheduling: Song + Styles → tick-based note events per track.
 * Chords say what; the section's style (and substyle) says how.
 * Playback and MIDI export both consume this.
 */
import { Note } from 'tonal';
import type { Song, Track } from '../model/song';
import { parseMeter, songTracks } from '../model/song';
import type { ChordClass, Pattern, RolePatterns, Style, Substyle } from '../model/style';
import { bassFor, bassNoteFor, defaultVoicingFor, voiceProgression } from './voicing';
import { parseChord } from './harmony';
import { applyFeel } from './style/apply';
import { substyleForSection } from './style/resolve';
import { choosePattern, unit, type MeasureContext } from './style/select';

export const PPQ = 192; // Tone.js default

export interface PositionEvent {
  tick: number;
  durationTicks: number;
  measure: number;
  beat: number;
  beats: number;
  symbol: string;
  sectionIndex: number;
}

export interface NoteEvent {
  trackId: string;
  tick: number;
  durationTicks: number;
  notes: string[];
  velocity: number;
}

export interface Schedule {
  positions: PositionEvent[];
  notes: NoteEvent[];
  tracks: Track[];
  measureStartTicks: number[];
  totalTicks: number;
  ticksPerBeat: number;
}

interface MeasureInfo { index: number; sectionIndex: number; indexInSection: number; sectionLength: number; startTick: number; style: Style; substyle: Substyle; chordIdx: number[]; transition?: { kind: 'rush' | 'relax'; amount: number; t: number } }

function chordClass(symbol: string): ChordClass {
  const q = parseChord(symbol).quality;
  return q === 'major' || q === 'minor' || q === 'dominant' || q === 'half-diminished' || q === 'diminished' ? q : 'other';
}

export function buildSchedule(song: Song): Schedule {
  const meter = parseMeter(song.meter);
  const tpb = PPQ * (4 / meter.unit);
  const tracks = songTracks(song);
  const positions: PositionEvent[] = [];
  const notes: NoteEvent[] = [];
  const measureStartTicks: number[] = [];
  const measures: MeasureInfo[] = [];
  const seed = song.arrangement?.seed ?? 1;
  const fills = song.arrangement?.fills ?? true;

  // Pass 1: chord positions and measure map.
  let tick = 0;
  song.sections.forEach((section, si) => {
    const { style, substyle } = substyleForSection(song, si);
    section.measures.forEach((measure, mi) => {
      measureStartTicks.push(tick);
      const info: MeasureInfo = { index: measures.length, sectionIndex: si, indexInSection: mi, sectionLength: section.measures.length, startTick: tick, style, substyle, chordIdx: [] };
      let beatInMeasure = 0;
      for (const ch of measure.chords) {
        const durationTicks = Math.round(ch.beats * tpb);
        info.chordIdx.push(positions.length);
        positions.push({ tick, durationTicks, measure: info.index + 1, beat: beatInMeasure + 1, beats: ch.beats, symbol: ch.symbol, sectionIndex: si });
        tick += durationTicks;
        beatInMeasure += ch.beats;
      }
      if (measure.chords.length === 0) tick += meter.beats * tpb;
      measures.push(info);
    });
  });
  const totalTicks = tick;
  const symbols = positions.map((p) => p.symbol);
  const lastMeasure = measures.length - 1;

  // Transitions: the last `bars` of the section before `beforeSection` get a progress t in (0,1].
  for (const tr of song.arrangement?.transitions ?? []) {
    const prevSection = tr.beforeSection - 1;
    if (prevSection < 0) continue;
    const bars = measures.filter((m) => m.sectionIndex === prevSection);
    const n = Math.min(Math.max(1, Math.round(tr.bars)), bars.length);
    bars.slice(-n).forEach((m, i) => { m.transition = { kind: tr.kind, amount: tr.amount, t: (i + 1) / n }; });
  }

  /** Chord sounding at an absolute tick anywhere in the song (wraps for pushes past the end). */
  const chordAtTick = (absTick: number): number => {
    const t = ((absTick % totalTicks) + totalTicks) % totalTicks;
    let lo = 0, hi = positions.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (positions[mid].tick <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  };
  const ctxFor = (m: MeasureInfo): MeasureContext => ({
    measureIndex: m.index, indexInSection: m.indexInSection, sectionLength: m.sectionLength, sectionIndex: m.sectionIndex,
    isSongStart: m.index === 0 || (m.sectionIndex === 0), isSongEnd: m.index === lastMeasure, seed, fills, defaultBars: m.style.bars,
  });
  const push = (trackId: string, role: Track['role'], m: MeasureInfo, beatInBar: number, durationBeats: number, velocity: number, names: string[]) => {
    if (!names.length) return;
    const nominal = m.startTick + Math.round(beatInBar * tpb);
    const f = applyFeel({ tick: nominal, beatInBar, velocity, role, ticksPerBeat: tpb }, m.style.feel, totalTicks);
    let outTick = f.tick, outVel = f.velocity;
    if (m.transition) {
      const { kind, amount, t } = m.transition;
      const k = amount * t;
      const offbeat = Math.abs(beatInBar - Math.round(beatInBar)) > 1e-6;
      if (kind === 'relax') {
        // Lay back, soften, thin the texture (off-beat comp/drum hits drop out progressively).
        if (offbeat && role !== 'bass' && unit(seed, 99, nominal, role.length) < k * 0.7) return;
        outTick += Math.round(k * (tpb / 12));
        outVel = Math.round(outVel * (1 - 0.25 * k));
      } else {
        // Rush: ahead of the beat, lift energy.
        outTick -= Math.round(k * (tpb / 12));
        outVel = Math.round(outVel * (1 + 0.2 * k));
      }
      outTick = Math.max(0, Math.min(totalTicks - 1, outTick));
      outVel = Math.max(1, Math.min(127, outVel));
    }
    notes.push({ trackId, tick: outTick, durationTicks: Math.max(1, Math.round(durationBeats * tpb)), notes: names, velocity: outVel });
  };
  /** Iterate the hits of the chosen pattern that fall in this measure, with the chord each should take (honoring push and chordTypes). */
  function* hitsIn<H extends { beat: number; push?: number; chordTypes?: ChordClass[] }>(role: RolePatterns<H> | undefined, m: MeasureInfo): Generator<{ hit: H; beat: number; chordIdx: number }> {
    if (!role) return;
    const chosen = choosePattern(role, ctxFor(m));
    if (!chosen) return;
    const bars = chosen.pattern.bars ?? m.style.bars;
    void bars;
    for (const hit of chosen.pattern.hits) {
      const beat = hit.beat - chosen.barInPattern * m.style.beatsPerBar;
      if (beat < 0 || beat >= meter.beats) continue;
      const idx = chordAtTick(m.startTick + Math.round((beat + (hit.push ?? 0)) * tpb));
      if (idx < 0) continue;
      if (hit.chordTypes && !hit.chordTypes.includes(chordClass(positions[idx].symbol))) continue;
      yield { hit, beat, chordIdx: idx };
    }
  }

  // Pass 2: per track.
  for (const t of tracks) {
    if (t.role === 'chords') {
      const voicingCache = new Map<string, string[][]>();
      const voicingsFor = (sub: Substyle) => {
        const vs = t.voicing ?? sub.comp?.voicing ?? defaultVoicingFor(t.program);
        if (!voicingCache.has(vs)) voicingCache.set(vs, voiceProgression(symbols, vs));
        return voicingCache.get(vs)!;
      };
      for (const m of measures) {
        const voicings = voicingsFor(m.substyle);
        const role = m.substyle.comp ?? { variations: [{ hits: [{ beat: 0, duration: meter.beats, velocity: 80, voice: 'full' as const }] }] };
        const arpState = new Map<number, number>();
        const covered = new Set<number>();
        for (const { hit, beat, chordIdx } of hitsIn(role, m)) {
          const v = voicings[chordIdx] ?? [];
          if (!v.length) continue;
          covered.add(chordIdx);
          const p = positions[chordIdx];
          const chordEndBeat = (p.tick + p.durationTicks - m.startTick) / tpb;
          const dur = hit.push ? hit.duration : Math.max(0.1, Math.min(hit.duration, chordEndBeat - beat));
          let names: string[] = v;
          if (hit.voice === 'top') names = [v[v.length - 1]];
          else if (hit.voice === 'bottom') names = [v[0]];
          else if (hit.voice === 'arpUp' || hit.voice === 'arpDown') {
            const n = arpState.get(chordIdx) ?? 0;
            names = [hit.voice === 'arpUp' ? v[n % v.length] : v[v.length - 1 - (n % v.length)]];
            arpState.set(chordIdx, n + 1);
          }
          push(t.id, 'chords', m, beat, dur, hit.velocity, names);
        }
        // A chord change in this bar with no hit on it still gets sounded.
        for (const i of m.chordIdx) {
          if (covered.has(i)) continue;
          const p = positions[i];
          const v = voicings[i] ?? [];
          if (v.length) push(t.id, 'chords', m, (p.tick - m.startTick) / tpb, Math.min(1, p.beats), 74, v);
        }
      }
    } else if (t.role === 'bass') {
      let prev: number | null = null;
      for (const m of measures) {
        const role = m.substyle.bass;
        const styleId = t.bassStyle ?? role?.style ?? 'roots-fifths';
        const patterned = !t.bassStyle && role && (role.variations.length || role.fills?.length || role.intro || role.ending);
        if (patterned) {
          for (const { hit, beat, chordIdx } of hitsIn(role, m)) {
            const p = positions[chordIdx];
            const next = positions[(chordIdx + 1) % positions.length]?.symbol ?? null;
            const midi = bassNoteFor(p.symbol, hit.degree, next, prev);
            if (midi == null) continue;
            prev = midi;
            push(t.id, 'bass', m, beat, hit.duration, hit.velocity, [Note.fromMidi(midi)]);
          }
        } else {
          for (const i of m.chordIdx) {
            const p = positions[i];
            const next = positions[(i + 1) % positions.length]?.symbol ?? null;
            for (const h of bassFor(p.symbol, p.beats, styleId, next, prev)) {
              push(t.id, 'bass', m, (p.tick - m.startTick) / tpb + h.beatOffset, h.beats * 0.9, h.velocity, [h.note]);
              prev = Note.midi(h.note) ?? prev;
            }
          }
        }
      }
    } else if (t.role === 'drums') {
      for (const m of measures) {
        for (const { hit, beat } of hitsIn(m.substyle.drums, m)) push(t.id, 'drums', m, beat, hit.duration, hit.velocity, [Note.fromMidi(hit.drum)]);
      }
    }
  }
  notes.sort((a, b) => a.tick - b.tick);
  return { positions, notes, tracks, measureStartTicks, totalTicks, ticksPerBeat: tpb };
}

export type { Pattern };

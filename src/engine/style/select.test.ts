import { describe, expect, it } from 'vitest';
import { Note } from 'tonal';
import { choosePattern, pickWeighted, unit } from './select';
import { normalizeStyle, validateStyle, type StyleV1 } from '../../model/style';
import { PRESET_STYLES } from './presets';
import { buildSchedule, PPQ } from '../schedule';
import { defaultSong, defaultTracks } from '../../model/song';

describe('selection', () => {
  it('unit hash is deterministic and in range', () => {
    expect(unit(1, 2, 3)).toBe(unit(1, 2, 3));
    expect(unit(1, 2, 3)).not.toBe(unit(2, 2, 3));
    for (let i = 0; i < 50; i++) { const u = unit(i, 7); expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThan(1); }
  });
  it('weighted pick honors weights', () => {
    const ps = [{ hits: [], weight: 3 }, { hits: [], weight: 1 }];
    let a = 0;
    for (let i = 0; i < 1000; i++) if (pickWeighted(ps, i / 1000) === ps[0]) a++;
    expect(a).toBeGreaterThan(700); expect(a).toBeLessThan(800);
  });
  it('fills land on the last bar of a section; multi-bar variations stay grouped', () => {
    const role = { variations: [{ hits: [], bars: 2 }], fills: [{ hits: [], bars: 1 }] };
    const base = { measureIndex: 0, sectionLength: 8, sectionIndex: 0, isSongStart: false, isSongEnd: false, seed: 1, fills: true, defaultBars: 2 };
    expect(choosePattern(role, { ...base, indexInSection: 7 })!.kind).toBe('fill');
    expect(choosePattern(role, { ...base, indexInSection: 6 })!.kind).toBe('variation');
    expect(choosePattern(role, { ...base, indexInSection: 3 })!.barInPattern).toBe(1);
    expect(choosePattern(role, { ...base, indexInSection: 7, fills: false })!.kind).toBe('variation');
  });
});

describe('v1 → v2', () => {
  it('normalizes and validates a v1 style', () => {
    const v1: StyleV1 = { id: 'x', name: 'X', bars: 1, beatsPerBar: 4, feel: { swing: 0, pushPull: 0, humanize: 0, accents: [1] }, comp: { hits: [{ beat: 0, duration: 1, velocity: 80, voice: 'full' }] }, drums: { hits: [{ beat: 0, duration: 0.5, velocity: 90, drum: 36 }] } };
    const v2 = normalizeStyle(v1);
    expect(v2.substyles.a.comp?.variations[0].hits.length).toBe(1);
    expect(validateStyle(v1)).toEqual([]);
    expect(validateStyle(v2)).toEqual([]);
  });
  it('all presets validate and have A substyles', () => {
    for (const s of Object.values(PRESET_STYLES)) { expect(validateStyle(s)).toEqual([]); expect(s.substyles.a).toBeTruthy(); }
  });
  it('rejects bad hits', () => {
    const bad = { ...PRESET_STYLES.swing, substyles: { a: { drums: { variations: [{ hits: [{ beat: 9, duration: 1, velocity: 90, drum: 36 }] }] } } } };
    expect(validateStyle(bad).some((e) => e.includes('beat out of range'))).toBe(true);
  });
});

describe('schedule with v2 styles', () => {
  it('substyle B changes the drums; fills appear on section last bars', () => {
    const song = defaultSong();
    song.tracks = defaultTracks();
    song.arrangement = { defaultStyle: 'straight8', substyles: { '1': 'b' } };
    const s = buildSchedule(song);
    const drums = s.notes.filter((n) => n.trackId === 'drums');
    const bStart = s.measureStartTicks[8], bEnd = s.measureStartTicks[16];
    const inA = drums.filter((n) => n.tick < bStart - 20).map((n) => Note.midi(n.notes[0])); // -20: humanize can pull B's downbeat a few ticks early
    const inB = drums.filter((n) => n.tick >= bStart && n.tick < bEnd).map((n) => Note.midi(n.notes[0]));
    expect(inB).toContain(46);       // open hats only in B
    expect(inA).not.toContain(46);
    // Fill: section A's last bar (measure 8) has toms; bar 7 does not.
    const m8 = s.measureStartTicks[7], m7 = s.measureStartTicks[6];
    const toms = (from: number, to: number) => drums.filter((n) => n.tick >= from && n.tick < to).some((n) => [45, 47, 50].includes(Note.midi(n.notes[0])!));
    expect(toms(m8, m8 + 4 * PPQ)).toBe(true);
    expect(toms(m7, m7 + 4 * PPQ)).toBe(false);
  });
  it('a pushed hit takes the next bar\'s chord', () => {
    const song = defaultSong();
    song.tracks = defaultTracks();
    // Custom style: one comp hit on the "and of 4" pushing into the next bar.
    song.styles = { p: { id: 'p', name: 'P', bars: 1, beatsPerBar: 4, feel: { swing: 0, pushPull: 0, humanize: 0, accents: [1, 1, 1, 1] }, substyles: { a: { comp: { voicing: 'shell', variations: [{ hits: [{ beat: 3.5, duration: 0.5, velocity: 80, voice: 'full', push: 0.5 }] }] } } } } };
    song.arrangement = { defaultStyle: 'p', fills: false };
    const s = buildSchedule(song);
    const piano = s.notes.filter((n) => n.trackId === 'piano');
    // Bar 1 is Cm7, bar 2 is F7. The pushed hit at beat 3.5 of bar 1 should voice F7 (shell: A, Eb) not Cm7 (Eb, Bb).
    const pushed = piano.find((n) => n.tick === Math.round(3.5 * PPQ))!;
    expect(new Set(pushed.notes.map((x) => Note.chroma(x)))).toEqual(new Set([9, 3]));
  });
  it('chordTypes gates hits', () => {
    const song = defaultSong();
    song.styles = { g: { id: 'g', name: 'G', bars: 1, beatsPerBar: 4, feel: { swing: 0, pushPull: 0, humanize: 0, accents: [1, 1, 1, 1] }, substyles: { a: { drums: { variations: [{ hits: [{ beat: 0, duration: 0.5, velocity: 90, drum: 49, chordTypes: ['dominant'] }] }] } } } } };
    song.arrangement = { defaultStyle: 'g', fills: false };
    song.tracks = defaultTracks();
    const s = buildSchedule(song);
    const crashes = s.notes.filter((n) => n.trackId === 'drums').length;
    // The hit is on beat 1, so only dominants that START a bar can trigger it.
    const dominants = s.positions.filter((p) => p.beat === 1 && /7(?!M)/.test(p.symbol) && !/m7|Maj7|m7b5/.test(p.symbol)).length;
    expect(crashes).toBe(dominants);
  });
});

import { describe, expect, it } from 'vitest';
import { Note } from 'tonal';
import { bassFor, chordTones, voiceProgression } from './voicing';

const pcs = (names: string[]) => new Set(names.map((n) => Note.chroma(n)));
const midis = (names: string[]) => names.map((n) => Note.midi(n)!);

describe('chord tones', () => {
  it('maps slots for common symbols', () => {
    const t = chordTones('G7b9')!;
    expect([t.root, t.third, t.fifth, t.seventh, t.ninth]).toEqual([7, 11, 2, 5, 8]);
    const m6 = chordTones('Gm6')!;
    expect(m6.sixth).toBe(4);
    expect(chordTones('C7#11')!.eleventh).toBe(6);
    expect(chordTones('N.C.')).toBeNull();
  });
});

describe('voicings', () => {
  it('rootless omits the root and includes the 9th', () => {
    const [v] = voiceProgression(['Cm7'], 'rootless');
    expect(pcs(v)).toEqual(pcs(['Eb', 'G', 'Bb', 'D']));
  });
  it('shell is third and seventh only', () => {
    const [v] = voiceProgression(['F7'], 'shell');
    expect(pcs(v)).toEqual(pcs(['A', 'Eb']));
  });
  it('replaces the 5th with alterations/extensions', () => {
    expect(pcs(voiceProgression(['G7b13'], 'rootless')[0])).toEqual(pcs(['B', 'Eb', 'F', 'A']));
    expect(pcs(voiceProgression(['C13'], 'rootless')[0])).toEqual(pcs(['E', 'A', 'Bb', 'D']));
  });
  it('keeps every style inside its register and span', () => {
    const prog = ['Cm7', 'F7', 'BbMaj7', 'EbMaj7', 'Am7b5', 'D7b9', 'Gm6', 'G7#11', 'Dsus4', 'C'];
    for (const style of ['close', 'shell', 'rootless', 'drop2', 'guitar'] as const) {
      for (const v of voiceProgression(prog, style)) {
        const m = midis(v);
        expect(m.length).toBeGreaterThan(0);
        expect(Math.min(...m)).toBeGreaterThanOrEqual(style === 'guitar' ? 40 : 48);
        expect(Math.max(...m)).toBeLessThanOrEqual(79);
        expect(Math.max(...m) - Math.min(...m)).toBeLessThanOrEqual(19);
        if (style === 'guitar') expect(m.length).toBeLessThanOrEqual(4);
      }
    }
  });
  it('voice-leads a ii-V-I with small total movement', () => {
    const [a, b, c] = voiceProgression(['Dm7', 'G7', 'Cmaj7'], 'rootless').map(midis);
    const move = (x: number[], y: number[]) => x.reduce((s, v, i) => s + Math.abs(v - y[i]), 0);
    expect(move(a, b)).toBeLessThanOrEqual(6);
    expect(move(b, c)).toBeLessThanOrEqual(6);
  });
  it('returns empty for N.C.', () => {
    expect(voiceProgression(['N.C.'], 'rootless')[0]).toEqual([]);
  });
});

describe('bass', () => {
  it('roots & fifths on a 4-beat chord', () => {
    const hits = bassFor('Cm7', 4, 'roots-fifths', 'F7', null);
    expect(hits.map((h) => [h.beatOffset, Note.chroma(h.note)])).toEqual([[0, 0], [2, 7]]);
  });
  it('walking line has one note per beat and approaches the next root by a half step', () => {
    const hits = bassFor('Cm7', 4, 'walking', 'F7', null);
    expect(hits.length).toBe(4);
    expect(Note.chroma(hits[0].note)).toBe(0);
    const last = Note.midi(hits[3].note)!;
    const fChromaDist = Math.min(...[4, 6].map((c) => Math.abs(((last % 12) - c + 12) % 12))); // E or F# (half step around F)
    expect(fChromaDist).toBe(0);
    for (const h of hits) { const m = Note.midi(h.note)!; expect(m).toBeGreaterThanOrEqual(28); expect(m).toBeLessThanOrEqual(55); }
  });
  it('slash chords put the slash note in the bass', () => {
    expect(Note.chroma(bassFor('F/A', 4, 'roots', null, null)[0].note)).toBe(9);
  });
});

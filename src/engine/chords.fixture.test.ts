/**
 * Chord symbol robustness (F4): real-world spellings must parse, transpose
 * round-trip, voice, and map to a MusicXML kind.
 */
import { describe, expect, it } from 'vitest';
import { Note } from 'tonal';
import { parseChord, transposeChordSymbol } from './harmony';
import { voiceProgression, chordTones } from './voicing';
import { songToMusicXml } from './export/musicxml';
import { defaultSong } from '../model/song';

type Q = ReturnType<typeof parseChord>['quality'];
/** [symbol, expected root, expected quality] */
const FIXTURE: Array<[string, string, Q]> = [
  ['C', 'C', 'major'], ['Cmaj7', 'C', 'major'], ['CMaj7', 'C', 'major'], ['CM7', 'C', 'major'], ['CΔ7', 'C', 'major'], ['CΔ', 'C', 'major'], ['Cmaj9', 'C', 'major'], ['Cmaj7#11', 'C', 'major'], ['C6', 'C', 'major'], ['C6/9', 'C', 'major'], ['C69', 'C', 'major'], ['Cadd9', 'C', 'major'], ['C2', 'C', 'major'], ['Cmaj13', 'C', 'major'],
  ['Cm', 'C', 'minor'], ['Cmin', 'C', 'minor'], ['C-', 'C', 'minor'], ['Cm7', 'C', 'minor'], ['Cmin7', 'C', 'minor'], ['C-7', 'C', 'minor'], ['Cm9', 'C', 'minor'], ['Cm11', 'C', 'minor'], ['Cm6', 'C', 'minor'], ['Cm(maj7)', 'C', 'minor'], ['CmMaj7', 'C', 'minor'], ['Cm/maj7', 'C', 'minor'], ['Cm7b5', 'C', 'half-diminished'], ['Cm7(b5)', 'C', 'half-diminished'], ['Cø', 'C', 'half-diminished'], ['Cø7', 'C', 'half-diminished'], ['C-7b5', 'C', 'half-diminished'],
  ['C7', 'C', 'dominant'], ['C9', 'C', 'dominant'], ['C13', 'C', 'dominant'], ['C7b9', 'C', 'dominant'], ['C7#9', 'C', 'dominant'], ['C7(b9)', 'C', 'dominant'], ['C7(#9)', 'C', 'dominant'], ['C7#11', 'C', 'dominant'], ['C7b13', 'C', 'dominant'], ['C7#5', 'C', 'dominant'], ['C7+', 'C', 'dominant'], ['C7+5', 'C', 'dominant'], ['C7alt', 'C', 'dominant'], ['C7sus4', 'C', 'dominant'], ['C7sus', 'C', 'dominant'], ['C9sus4', 'C', 'dominant'], ['C13sus', 'C', 'dominant'], ['C7(b9,#11)', 'C', 'dominant'], ['C7b9#11', 'C', 'dominant'],
  ['Cdim', 'C', 'diminished'], ['Cdim7', 'C', 'diminished'], ['C°', 'C', 'diminished'], ['C°7', 'C', 'diminished'], ['Co7', 'C', 'diminished'], ['Co', 'C', 'diminished'],
  ['Caug', 'C', 'augmented'], ['C+', 'C', 'augmented'], ['C+7', 'C', 'dominant'],
  ['Csus', 'C', 'suspended'], ['Csus4', 'C', 'suspended'], ['Csus2', 'C', 'suspended'], ['C5', 'C', 'major'],
  ['Bb7', 'Bb', 'dominant'], ['F#m7b5', 'F#', 'half-diminished'], ['Ebmaj7#11', 'Eb', 'major'], ['Abm7', 'Ab', 'minor'], ['Dbmaj7', 'Db', 'major'], ['G#dim7', 'G#', 'diminished'], ['A♭7', 'Ab', 'dominant'], ['F♯m7', 'F#', 'minor'],
  ['C/E', 'C', 'major'], ['Am7/G', 'A', 'minor'], ['Bb/D', 'Bb', 'major'], ['G7/B', 'G', 'dominant'], ['Dm7/G', 'D', 'minor'], ['c7', 'C', 'dominant'], ['bbmaj7', 'Bb', 'major'],
];

describe('chord symbol fixture', () => {
  it.each(FIXTURE)('%s parses as %s %s', (sym, root, quality) => {
    const p = parseChord(sym);
    expect(p.isNoChord).toBe(false);
    expect(p.root).toBe(root);
    expect(p.quality).toBe(quality);
    expect(p.notes.length).toBeGreaterThanOrEqual(2);
  });
  it.each(FIXTURE)('%s transposes round-trip and voices', (sym) => {
    const up = transposeChordSymbol(sym, 5, true);
    const back = transposeChordSymbol(up, -5, true);
    expect(Note.chroma(parseChord(back).root)).toBe(Note.chroma(parseChord(sym).root));
    expect(parseChord(up).root).not.toMatch(/#/); // preferFlats honored
    expect(parseChord(up).quality).toBe(parseChord(sym).quality);
    expect(chordTones(sym)).not.toBeNull();
    for (const style of ['rootless', 'shell', 'guitar'] as const) expect(voiceProgression([sym], style)[0].length).toBeGreaterThan(0);
  });
  it('maps every fixture symbol to a MusicXML kind other than "other" (except where no kind exists)', () => {
    const allowedOther = new Set<string>();
    const song = defaultSong();
    song.sections = [{ name: 'X', measures: FIXTURE.map(([sym]) => ({ chords: [{ symbol: sym, beats: 4 }] })) }];
    const xml = songToMusicXml(song);
    const harmonies = xml.match(/<harmony>.*?<\/harmony>/g) ?? [];
    expect(harmonies.length).toBe(FIXTURE.length);
    harmonies.forEach((h, i) => {
      const sym = FIXTURE[i][0];
      const kind = /<kind[^>]*>([^<]+)<\/kind>/.exec(h)![1];
      if (!allowedOther.has(sym)) expect(kind, sym).not.toBe('other');
    });
  });
});

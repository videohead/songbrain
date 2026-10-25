import { describe, expect, it } from 'vitest';
import { analyzeProgression, parseChord, transposeChordSymbol, transposeKey, voiceChord } from './harmony';
import { defaultSong, defaultTracks, validateSong } from '../model/song';
import { insertMeasures, measuresFromSymbols, transposeSong } from './progression';
import { songToMidi } from './export/midi';
import { songToMusicXml } from './export/musicxml';

describe('harmony', () => {
  it('parses common jazz symbols', () => {
    expect(parseChord('Cm7').quality).toBe('minor');
    expect(parseChord('F7').quality).toBe('dominant');
    expect(parseChord('BbMaj7').quality).toBe('major');
    expect(parseChord('Am7b5').quality).toBe('half-diminished');
    expect(parseChord('D7b9').quality).toBe('dominant');
    expect(parseChord('Bb/D').bass).toBe('D');
    expect(parseChord('N.C.').isNoChord).toBe(true);
  });
  it('transposes symbols with sensible spelling', () => {
    expect(transposeChordSymbol('Cm7', 2, false)).toBe('Dm7');
    expect(transposeChordSymbol('BbMaj7', 3, true)).toBe('DbMaj7');
    expect(transposeChordSymbol('Am7b5', 3, true)).toBe('Cm7b5');
    expect(transposeChordSymbol('F/A', 2, false)).toBe('G/B');
    expect(transposeKey('G Minor', 3)).toBe('Bb Minor');
  });
  it('voices chords with bass root', () => {
    const v = voiceChord('Cm7');
    expect(v.bass).toBe('C2');
    expect(v.piano.length).toBeGreaterThanOrEqual(3);
  });
  it('detects ii-V-I', () => {
    const a = analyzeProgression(defaultSong());
    expect(a.patterns.some((p) => p.startsWith('ii–V–I in Bb'))).toBe(true);
    expect(a.chords[0].roman).toBe('iv7');
  });
});

describe('progression', () => {
  it('transposes a song to a target key', () => {
    const s = transposeSong(defaultSong(), { toKey: 'Bb' });
    expect(s.key).toBe('Bb Minor');
    expect(s.sections[0].measures[0].chords[0].symbol).toBe('Ebm7');
    expect(validateSong(s).ok).toBe(true);
  });
  it('inserts a ii-V before measure 8', () => {
    const song = defaultSong();
    const out = insertMeasures(song, 8, measuresFromSymbols(song, ['Am7b5', 'D7'], 2));
    expect(out.sections[0].measures.length).toBe(9);
    expect(out.sections[0].measures[7].chords.map((c) => c.symbol)).toEqual(['Am7b5', 'D7']);
    expect(validateSong(out).ok).toBe(true);
  });
});

describe('export', () => {
  it('writes a MIDI header with one chunk per track plus meta', () => {
    const bytes = songToMidi(defaultSong());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
    expect((bytes[10] << 8) | bytes[11]).toBe(4); // meta + piano + bass + drums
    // Second chunk (piano) starts with a program change on channel 1 (0xC0 0x00) after the track-name meta.
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(' ');
    expect(hex).toContain('c0 00');          // piano program 0 on channel 1
    expect(hex).toContain('c1 20');          // bass program 32 on channel 2
    expect(hex).toContain('b1 07 6e');       // bass level CC7 = 110
  });
  it('honors mute and solo in MIDI export', () => {
    const song = defaultSong();
    song.tracks = defaultTracks().map((t) => (t.id === 'bass' ? { ...t, solo: true } : t));
    const bytes = songToMidi(song);
    expect((bytes[10] << 8) | bytes[11]).toBe(2); // meta + bass only
  });
  it('validates tracks', () => {
    const song = defaultSong();
    song.tracks = defaultTracks();
    expect(validateSong(song).ok).toBe(true);
    song.tracks[0].channel = 17;
    expect(validateSong(song).ok).toBe(false);
  });
  it('writes MusicXML with harmony', () => {
    const xml = songToMusicXml(defaultSong());
    expect(xml).toContain('<harmony><root><root-step>C</root-step></root><kind>minor-seventh</kind></harmony>');
    expect(xml).toContain('<fifths>-2</fifths>');
    expect(xml).toContain('<midi-channel>2</midi-channel><midi-program>33</midi-program>'); // bass: GM 32 is 1-based 33 in MusicXML
    expect((xml.match(/<score-part /g) ?? []).length).toBe(2);
  });
});

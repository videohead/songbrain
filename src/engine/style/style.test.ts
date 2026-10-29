import { describe, expect, it } from 'vitest';
import { Note } from 'tonal';
import { defaultTracks, validateSong } from '../../model/song';
import { jazzFixtureSong } from '../../model/fixtures';
import { validateStyle } from '../../model/style';
import { PRESET_STYLES } from './presets';
import { applyFeel } from './apply';
import { buildSchedule, PPQ } from '../schedule';
import { songToMidi } from '../export/midi';
import { songToMusicXml } from '../export/musicxml';

describe('presets', () => {
  it('all validate', () => {
    for (const s of Object.values(PRESET_STYLES)) expect(validateStyle(s)).toEqual([]);
  });
});

describe('feel', () => {
  const feel = { swing: 1, pushPull: 0, humanize: 0, accents: [1, 0.5, 1, 0.5] };
  it('swings off-beat 8ths toward the triplet and leaves downbeats alone', () => {
    const on = applyFeel({ tick: 0, beatInBar: 0, velocity: 100, role: 'drums', ticksPerBeat: PPQ }, feel, 10_000);
    const off = applyFeel({ tick: PPQ / 2, beatInBar: 0.5, velocity: 100, role: 'drums', ticksPerBeat: PPQ }, feel, 10_000);
    expect(on.tick).toBe(0);
    expect(off.tick).toBe(Math.round(PPQ / 2 + PPQ / 6));
  });
  it('applies accents and per-role push-pull', () => {
    const r = applyFeel({ tick: PPQ, beatInBar: 1, velocity: 100, role: 'chords', ticksPerBeat: PPQ }, { ...feel, rolePushPull: { chords: 5 } }, 10_000);
    expect(r.velocity).toBe(50);
    expect(r.tick).toBe(PPQ + 5);
  });
});

describe('style-driven schedule', () => {
  it('produces drum notes on the drums track and respects per-section styles', () => {
    const song = jazzFixtureSong();
    song.tracks = defaultTracks();
    song.arrangement = { defaultStyle: 'swing', sections: { '1': 'bossa' } };
    const s = buildSchedule(song);
    const drums = s.notes.filter((n) => n.trackId === 'drums');
    expect(drums.length).toBeGreaterThan(0);
    // Swing section uses ride (51); bossa section uses side stick (37) and no ride.
    const sectionBStart = s.measureStartTicks[8], sectionBEnd = s.measureStartTicks[16];
    const inB = drums.filter((n) => n.tick >= sectionBStart && n.tick < sectionBEnd).map((n) => Note.midi(n.notes[0]));
    const inA = drums.filter((n) => n.tick < sectionBStart).map((n) => Note.midi(n.notes[0]));
    expect(inA).toContain(51);
    expect(inB).toContain(37);
    expect(inB).not.toContain(51);
  });
  it('comping follows the style rhythm, and chord changes without a hit still sound', () => {
    const song = jazzFixtureSong();
    song.arrangement = { defaultStyle: 'ballad' };
    const s = buildSchedule(song);
    const piano = s.notes.filter((n) => n.trackId === 'piano');
    // Ballad: 3 hits per bar (full + 2 arpeggio notes) → arpeggio hits are single notes.
    const firstBar = piano.filter((n) => n.tick < 4 * PPQ);
    expect(firstBar.length).toBe(3);
    expect(firstBar[1].notes.length).toBe(1);
    // Split bar (measure 19: Gm7 C7) gets both chords sounded.
    const m19 = s.measureStartTicks[18];
    const inM19 = piano.filter((n) => n.tick >= m19 && n.tick < m19 + 4 * PPQ);
    expect(inM19.some((n) => n.tick >= m19 + 2 * PPQ - 10)).toBe(true);
  });
  it('bossa bass pattern uses roots and fifths from the pattern degrees', () => {
    const song = jazzFixtureSong();
    song.arrangement = { defaultStyle: 'bossa' };
    const s = buildSchedule(song);
    const bass = s.notes.filter((n) => n.trackId === 'bass' && n.tick < 4 * PPQ - 20).map((n) => Note.chroma(n.notes[0])); // -20: humanize may pull bar 2's downbeat a few ticks early
    expect(bass).toEqual([0, 7, 0, 7]); // Cm7: C G C G
  });
});

describe('drums export', () => {
  it('MIDI has a channel-10 track; MusicXML omits drums', () => {
    const song = jazzFixtureSong();
    song.tracks = defaultTracks();
    const hex = Array.from(songToMidi(song)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
    expect(hex).toContain('c9 00'); // program change on channel 10
    expect(hex).toMatch(/99 (24|33) /); // note-on ch10 for kick or ride
    const xml = songToMusicXml(song);
    expect((xml.match(/<score-part /g) ?? []).length).toBe(2);
    expect(validateSong(song).ok).toBe(true);
  });
  it('rejects bad arrangement and style docs', () => {
    const song = jazzFixtureSong();
    song.arrangement = { defaultStyle: 'swing', transitions: [{ beforeSection: 1, bars: 2, kind: 'rush', amount: 2 }] };
    expect(validateSong(song).ok).toBe(false);
  });
});

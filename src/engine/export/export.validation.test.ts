/**
 * Export validation (G2, G3): MIDI round-trips through our reader; MusicXML is
 * well-formed and structurally consistent (durations, element order, kinds).
 */
import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { defaultSong, defaultTracks, parseMeter, songTracks } from '../../model/song';
import { songToMidi } from './midi';
import { songToMusicXml } from './musicxml';
import { readMidi } from '../import/midiRead';
import { buildSchedule } from '../schedule';

const VALID_KINDS = new Set(['major', 'minor', 'augmented', 'diminished', 'dominant', 'major-seventh', 'minor-seventh', 'diminished-seventh', 'augmented-seventh', 'half-diminished', 'major-minor', 'major-sixth', 'minor-sixth', 'dominant-ninth', 'major-ninth', 'minor-ninth', 'dominant-11th', 'major-11th', 'minor-11th', 'dominant-13th', 'major-13th', 'minor-13th', 'suspended-second', 'suspended-fourth', 'Neapolitan', 'Italian', 'French', 'German', 'pedal', 'power', 'Tristan', 'other', 'none']);

function songs() {
  const a = defaultSong(); a.tracks = defaultTracks(); a.arrangement = { defaultStyle: 'swing' };
  const b = defaultSong(); b.meter = '3/4'; b.sections = [{ name: 'W', measures: [{ chords: [{ symbol: 'Cmaj7', beats: 2 }, { symbol: 'A7', beats: 1 }] }, { chords: [{ symbol: 'Dm7', beats: 3 }] }, { chords: [{ symbol: 'G7sus4', beats: 1.5 }, { symbol: 'G7', beats: 1.5 }] }] }];
  return [a, b];
}

describe('MIDI export round-trip (G3)', () => {
  for (const song of songs()) {
    it(`${song.meter}: reader sees the same tempo, meter, tracks, programs and notes`, () => {
      const sched = buildSchedule(song);
      const midi = readMidi(songToMidi(song));
      expect(midi.format).toBe(1);
      expect(midi.tempoBpm).toBe(song.tempo);
      expect(midi.timeSignature).toEqual(parseMeter(song.meter));
      const tracks = songTracks(song);
      expect(midi.tracks.length).toBe(1 + tracks.length);
      tracks.forEach((t, i) => {
        const mt = midi.tracks[i + 1];
        expect(mt.name).toBe(t.name);
        expect(mt.channel).toBe(t.channel);
        expect(mt.programs).toEqual([t.program]);
        const expected = sched.notes.filter((n) => n.trackId === t.id).reduce((s, n) => s + n.notes.length, 0);
        expect(mt.notes.length).toBe(expected);
        // Every exported note starts where the schedule says (PPQ is shared).
        const schedTicks = new Set(sched.notes.filter((n) => n.trackId === t.id).map((n) => n.tick));
        for (const n of mt.notes) expect(schedTicks.has(n.tick)).toBe(true);
        for (const n of mt.notes) { expect(n.velocity).toBeGreaterThan(0); expect(n.durationTicks).toBeGreaterThan(0); }
      });
      expect(midi.ppq).toBe(192);
    });
  }
});

describe('MusicXML export structure (G2)', () => {
  for (const song of songs()) {
    it(`${song.meter}: well-formed, consistent durations, valid order and kinds`, () => {
      const xml = songToMusicXml(song);
      const errors: string[] = [];
      const doc = new DOMParser({ onError: (level, msg) => { if (level !== 'warning') errors.push(msg); } }).parseFromString(xml, 'application/xml');
      expect(errors).toEqual([]);
      const parts = Array.from(doc.getElementsByTagName('part'));
      const scoreParts = Array.from(doc.getElementsByTagName('score-part'));
      expect(parts.length).toBe(scoreParts.length);
      expect(parts.length).toBe(songTracks(song).filter((t) => t.role !== 'drums').length);
      const meter = parseMeter(song.meter);
      for (const part of parts) {
        const measures = Array.from(part.getElementsByTagName('measure'));
        let divisions = 0;
        measures.forEach((m, mi) => {
          const d = m.getElementsByTagName('divisions')[0];
          if (d) divisions = Number(d.textContent);
          expect(divisions).toBeGreaterThan(0);
          const expectedDur = divisions * meter.beats * (4 / meter.unit);
          const notes = Array.from(m.getElementsByTagName('note'));
          const total = notes.reduce((s, n) => s + Number(n.getElementsByTagName('duration')[0]?.textContent ?? 0), 0);
          expect(total, `part ${part.getAttribute('id')} measure ${mi + 1} duration`).toBe(expectedDur);
          // Order: attributes first; harmony immediately precedes its note; no harmony after the last note.
          const kids = Array.from(m.childNodes).filter((n) => n.nodeType === 1).map((n) => n.nodeName);
          if (kids.includes('attributes')) expect(kids.indexOf('attributes')).toBe(0);
          kids.forEach((k, i) => { if (k === 'harmony') expect(kids[i + 1]).toBe('note'); });
          for (const kind of Array.from(m.getElementsByTagName('kind'))) expect(VALID_KINDS.has(kind.textContent ?? '')).toBe(true);
          for (const type of Array.from(m.getElementsByTagName('type'))) expect(['whole', 'half', 'quarter', 'eighth', '16th'].includes(type.textContent ?? '')).toBe(true);
        });
        // First measure declares key, time and clef.
        const first = measures[0];
        for (const tag of ['key', 'time', 'clef']) expect(first.getElementsByTagName(tag).length).toBe(1);
      }
      // Rehearsal marks: one per section.
      expect(doc.getElementsByTagName('rehearsal').length).toBe(song.sections.length);
    });
  }
});

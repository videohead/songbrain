import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { readMidi } from '../import/midiRead';
import { styleFromMidi } from './learn';
import { validateStyle } from '../../model/style';
import { buildSchedule } from '../schedule';
import { defaultSong, defaultTracks, type Measure } from '../../model/song';

const bar = (symbol: string): Measure => ({ chords: [{ symbol, beats: 4 }] });
const chart = ['D', 'D', 'D', 'D', 'G', 'G', 'C', 'C'].map(bar);

describe('MIDI-to-style learner (BiAB ZZJAZZ fixture)', () => {
  const midi = readMidi(new Uint8Array(fs.readFileSync('docs/ii-v-i.mid')));
  const { style, report } = styleFromMidi(midi, { id: 'zzjazz', name: 'ZZJAZZ (learned)', chart, source: 'docs/ii-v-i.mid' });

  it('reads the file and assigns roles', () => {
    expect(midi.tempoBpm).toBe(140);
    expect(report.roles.map((r) => r.role)).toEqual(['ignored', 'bass', 'drums', 'chords']);
  });
  it('skips the 2-bar count-in and finds the 2-bar ending', () => {
    expect(report.startBar).toBe(2);
    expect(report.endingBars).toBe(2);
  });
  it('estimates a swing feel', () => {
    expect(report.swing).toBeGreaterThan(0.6);
  });
  it('produces a valid style with all three roles and an ending', () => {
    expect(validateStyle(style)).toEqual([]);
    expect(style.substyles.a.drums!.variations.length).toBeGreaterThan(1);
    expect(style.substyles.a.bass!.variations.length).toBeGreaterThan(0);
    expect(style.substyles.a.comp!.variations.length).toBeGreaterThan(0);
    expect(style.substyles.a.drums!.ending?.bars).toBe(2);
  });
  it('bass is a two-feel: root on 1 and fifth on 3 dominate', () => {
    const hits = style.substyles.a.bass!.variations.flatMap((v) => v.hits);
    const onOne = hits.filter((h) => h.beat === 0).map((h) => h.degree);
    const onThree = hits.filter((h) => h.beat === 2).map((h) => h.degree);
    expect(onOne.every((d) => d === 'root' || d === 'octave')).toBe(true);
    expect(onThree.filter((d) => d === 'fifth').length).toBeGreaterThanOrEqual(onThree.length / 2);
    expect(style.substyles.a.bass!.style).toBe('roots-fifths');
  });
  it('drums keep GM notes; hats on 2 and 4', () => {
    const top = style.substyles.a.drums!.variations[0].hits;
    expect(top.some((h) => h.drum === 42 && (h.beat === 1 || h.beat === 3))).toBe(true);
  });
  it('the learned style drives the schedule on another song', () => {
    const song = defaultSong();
    song.tracks = defaultTracks();
    song.styles = { zzjazz: style };
    song.arrangement = { defaultStyle: 'zzjazz' };
    const s = buildSchedule(song);
    expect(s.notes.filter((n) => n.trackId === 'drums').length).toBeGreaterThan(50);
    expect(s.notes.filter((n) => n.trackId === 'bass').length).toBeGreaterThan(20);
    expect(s.notes.filter((n) => n.trackId === 'piano').length).toBeGreaterThan(10);
  });
});

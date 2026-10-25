import { describe, expect, it } from 'vitest';
import { buildSchedule, PPQ } from './schedule';
import { defaultSong, totalMeasures, defaultTracks } from '../model/song';

describe('schedule', () => {
  it('covers every measure of every section in ticks', () => {
    const song = defaultSong();
    const s = buildSchedule(song);
    const measures = totalMeasures(song);
    expect(measures).toBe(24);
    expect(s.measureStartTicks.length).toBe(measures);
    expect(s.totalTicks).toBe(measures * 4 * PPQ);
    expect(s.positions[s.positions.length - 1].measure).toBe(measures);
    expect(new Set(s.notes.map((n) => n.trackId))).toEqual(new Set(['piano', 'bass', 'drums']));
    expect(s.measureStartTicks[8]).toBe(8 * 4 * PPQ); // section B starts at bar 9
  });
  it('handles split bars and 3/4', () => {
    const song = defaultSong();
    song.meter = '3/4';
    song.sections = [{ name: 'A', measures: [{ chords: [{ symbol: 'C', beats: 2 }, { symbol: 'G7', beats: 1 }] }, { chords: [{ symbol: 'C', beats: 3 }] }] }];
    const s = buildSchedule(song);
    expect(s.totalTicks).toBe(6 * PPQ);
    expect(s.positions.map((e) => [e.measure, e.beat, e.tick])).toEqual([[1, 1, 0], [1, 3, 2 * PPQ], [2, 1, 3 * PPQ]]);
  });
});

describe('tracks', () => {
  it('generates notes only for tracks present in the song', () => {
    const song = defaultSong();
    song.tracks = [{ ...defaultTracks()[1], id: 'bass-only' }];
    const s = buildSchedule(song);
    expect(s.notes.every((n) => n.trackId === 'bass-only')).toBe(true);
    expect(s.notes.every((n) => n.notes.length === 1)).toBe(true);
  });
});

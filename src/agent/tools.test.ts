import { describe, expect, it } from 'vitest';
import { executeTool, type SongStore } from './tools';
import { defaultSong, totalMeasures, type Song } from '../model/song';

function makeStore(): SongStore & { labels: string[] } {
  let song: Song = defaultSong();
  const labels: string[] = [];
  return { labels, get: () => song, set: (s, d) => { song = s; labels.push(d); } };
}

describe('agent tools', () => {
  it('GetSong returns the song', () => {
    const r = executeTool(makeStore(), 'GetSong', '{}');
    expect(r.ok && (r.result as { song: Song }).song.title).toBe('Falling Leaves');
  });
  it('GetSong includes editor context when the store provides it', () => {
    const store = { ...makeStore(), context: () => ({ cursorMeasure: 5, selection: { from: 5, to: 8 }, playback: 'stopped' as const }) };
    const r = executeTool(store, 'GetSong', '{}');
    expect(r.ok && (r.result as { editor: { selection: { to: number } } }).editor.selection.to).toBe(8);
  });
  it('TransposeSong to Bb', () => {
    const store = makeStore();
    const r = executeTool(store, 'TransposeSong', JSON.stringify({ toKey: 'Bb' }));
    expect(r.ok).toBe(true);
    expect(store.get().key).toBe('Bb Minor');
  });
  it('InsertProgression before measure 8 (ii-V in one bar)', () => {
    const store = makeStore();
    const before = totalMeasures(store.get());
    const r = executeTool(store, 'InsertProgression', JSON.stringify({ beforeMeasure: 8, chords: ['Am7b5', 'D7b9'], chordsPerMeasure: 2 }));
    expect(r.ok).toBe(true);
    expect(totalMeasures(store.get())).toBe(before + 1);
    expect(store.get().sections[0].measures[7].chords.map((c) => c.symbol)).toEqual(['Am7b5', 'D7b9']);
  });
  it('AnalyzeProgression returns romans and patterns', () => {
    const r = executeTool(makeStore(), 'AnalyzeProgression', '{}');
    expect(r.ok && (r.result as { patterns: string[] }).patterns.length).toBeGreaterThan(0);
  });
  it('UpdateSong rejects invalid beats and accepts valid songs', () => {
    const store = makeStore();
    const bad = defaultSong();
    bad.sections[0].measures[0].chords[0].beats = 3;
    const r1 = executeTool(store, 'UpdateSong', JSON.stringify({ song: bad, summary: 'bad' }));
    expect(r1.ok).toBe(false);
    const good = defaultSong();
    good.title = 'Renamed';
    const r2 = executeTool(store, 'UpdateSong', JSON.stringify({ song: good, summary: 'rename' }));
    expect(r2.ok).toBe(true);
    expect(store.get().title).toBe('Renamed');
    expect(store.labels).toEqual(['rename']);
  });
  it('reports unknown tools and bad JSON gracefully', () => {
    expect(executeTool(makeStore(), 'Nope', '{}').ok).toBe(false);
    expect(executeTool(makeStore(), 'GetSong', '{bad').ok).toBe(false);
  });
});

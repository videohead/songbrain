import { describe, expect, it } from 'vitest';
import { executeTool, type SongStore } from './tools';
import { defaultSong, type Song } from '../model/song';
import { PRESET_STYLES } from '../engine/style/presets';
import { buildSchedule, PPQ } from '../engine/schedule';

function makeStore(): SongStore & { labels: string[]; auditioned: number[] } {
  let song: Song = defaultSong();
  const labels: string[] = []; const auditioned: number[] = [];
  return { labels, auditioned, get: () => song, set: (s, d) => { song = s; labels.push(d); }, context: () => ({ cursorMeasure: 10, selection: null, playback: 'stopped' }), audition: (si) => auditioned.push(si) };
}

describe('style tools', () => {
  it('ListStyles and GetStyle (cursor section, by id, unknown)', () => {
    const store = makeStore();
    const list = executeTool(store, 'ListStyles', '{}');
    expect(list.ok && (list.result as unknown[]).length).toBe(6);
    const cur = executeTool(store, 'GetStyle', '{}');
    expect(cur.ok && (cur.result as { sectionIndex: number }).sectionIndex).toBe(1); // measure 10 is in section B
    expect(executeTool(store, 'GetStyle', '{"id":"bossa"}').ok).toBe(true);
    expect(executeTool(store, 'GetStyle', '{"id":"nope"}').ok).toBe(false);
  });
  it('UpdateStyle refuses to overwrite a preset but accepts a renamed copy', () => {
    const store = makeStore();
    const edited = { ...PRESET_STYLES.swing, feel: { ...PRESET_STYLES.swing.feel, swing: 0.9 } };
    expect(executeTool(store, 'UpdateStyle', JSON.stringify({ style: edited, summary: 'x' })).ok).toBe(false);
    const mine = { ...edited, id: 'my-swing', name: 'My Swing' };
    expect(executeTool(store, 'UpdateStyle', JSON.stringify({ style: mine, summary: 'x' })).ok).toBe(true);
    expect(store.get().styles?.['my-swing'].feel.swing).toBe(0.9);
    const bad = { ...mine, feel: { ...mine.feel, swing: 3 } };
    expect(executeTool(store, 'UpdateStyle', JSON.stringify({ style: bad, summary: 'x' })).ok).toBe(false);
  });
  it('SetSectionStyle by name, index and default', () => {
    const store = makeStore();
    expect(executeTool(store, 'SetSectionStyle', JSON.stringify({ section: 'B', styleId: 'bossa', substyle: 'b' })).ok).toBe(true);
    expect(store.get().arrangement?.sections?.['1']).toBe('bossa');
    expect(store.get().arrangement?.substyles?.['1']).toBe('b');
    expect(executeTool(store, 'SetSectionStyle', JSON.stringify({ section: '2', substyle: 'b' })).ok).toBe(true);
    expect(executeTool(store, 'SetSectionStyle', JSON.stringify({ section: 'default', styleId: 'funk' })).ok).toBe(true);
    expect(store.get().arrangement?.defaultStyle).toBe('funk');
    expect(executeTool(store, 'SetSectionStyle', JSON.stringify({ section: 'Z', styleId: 'funk' })).ok).toBe(false);
  });
  it('SetTransition set and remove', () => {
    const store = makeStore();
    expect(executeTool(store, 'SetTransition', JSON.stringify({ beforeSection: 'C', bars: 2, kind: 'rush', amount: 0.8 })).ok).toBe(true);
    expect(store.get().arrangement?.transitions?.[0]).toEqual({ beforeSection: 2, bars: 2, kind: 'rush', amount: 0.8 });
    expect(executeTool(store, 'SetTransition', JSON.stringify({ beforeSection: 'A', bars: 2 })).ok).toBe(false);
    expect(executeTool(store, 'SetTransition', JSON.stringify({ beforeSection: 2, remove: true })).ok).toBe(true);
    expect(store.get().arrangement?.transitions).toEqual([]);
  });
  it('AuditionStyle applies and triggers playback of the cursor section', () => {
    const store = makeStore();
    const r = executeTool(store, 'AuditionStyle', JSON.stringify({ styleId: 'ballad' }));
    expect(r.ok).toBe(true);
    expect(store.auditioned).toEqual([1]);
    expect(store.get().arrangement?.sections?.['1']).toBe('ballad');
  });
});

describe('transitions in the schedule', () => {
  const base = () => { const s = defaultSong(); s.arrangement = { defaultStyle: 'straight8', fills: false }; return s; };
  it('relax lays back, softens and thins the last bars before the section', () => {
    const plain = buildSchedule(base());
    const song = base(); song.arrangement!.transitions = [{ beforeSection: 1, bars: 2, kind: 'relax', amount: 1 }];
    const s = buildSchedule(song);
    const from = s.measureStartTicks[6], to = s.measureStartTicks[8];
    const inWin = (x: typeof s) => x.notes.filter((n) => n.trackId === 'piano' && n.tick >= from - 30 && n.tick < to);
    expect(inWin(s).length).toBeLessThan(inWin(plain).length);
    const avgVel = (ns: { velocity: number }[]) => ns.reduce((a, n) => a + n.velocity, 0) / ns.length;
    expect(avgVel(inWin(s))).toBeLessThan(avgVel(inWin(plain)));
    // Downbeat of bar 8 is later than plain.
    const db = (x: typeof s) => x.notes.find((n) => n.trackId === 'drums' && Math.abs(n.tick - s.measureStartTicks[7]) < PPQ / 4)!.tick;
    expect(db(s)).toBeGreaterThan(db(plain));
  });
  it('rush pushes ahead and lifts velocity', () => {
    const plain = buildSchedule(base());
    const song = base(); song.arrangement!.transitions = [{ beforeSection: 1, bars: 1, kind: 'rush', amount: 1 }];
    const s = buildSchedule(song);
    const m8 = s.measureStartTicks[7];
    const first = (x: typeof s) => x.notes.find((n) => n.trackId === 'drums' && n.tick >= m8 - PPQ / 4 && n.tick < m8 + PPQ / 4)!;
    expect(first(s).tick).toBeLessThan(first(plain).tick);
    expect(first(s).velocity).toBeGreaterThan(first(plain).velocity);
  });
});

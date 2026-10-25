/**
 * Playback Engine. Derives everything from the Song via schedule.ts (ticks),
 * drives Tone's transport, and sends notes to the selected output sink:
 * a Web MIDI port (primary) or the built-in synths (fallback).
 */
import * as Tone from 'tone';
import type { Song, Track } from '../model/song';
import { audibleTracks, songTracks, totalMeasures } from '../model/song';
import { buildSchedule, type Schedule } from './schedule';
import { MidiSink, SynthSink, type Sink } from './output';

export type PlaybackState = 'stopped' | 'playing' | 'paused';
export type OutputSelection = { kind: 'synth' } | { kind: 'midi'; port: MIDIOutput };

export interface PlaybackPosition {
  measure: number;
  beat: number;
  state: PlaybackState;
  totalMeasures: number;
}

export interface PlaybackController {
  setSong(song: Song): void;
  setOutput(sel: OutputSelection): void;
  getOutput(): OutputSelection;
  play(fromMeasure?: number): Promise<void>;
  pause(): void;
  stop(): void;
  seek(measure: number): void;
  next(): void;
  prev(): void;
  toStart(): void;
  toEnd(): void;
  setLoop(loop: boolean): void;
  getPosition(): PlaybackPosition;
  onPosition(cb: (pos: PlaybackPosition) => void): () => void;
  dispose(): void;
}

const ticks = (n: number) => `${Math.round(n)}i`;
/** Everything the schedule depends on (tempo is handled live; level/pan/reverb/mute/solo are applied at play time). */
const structuralKey = (s: Song) => JSON.stringify({ sections: s.sections, meter: s.meter, arrangement: s.arrangement ?? null, styles: s.styles ?? null });
const trackShapeKey = (t: Track[]) => JSON.stringify(t.map((x) => [x.id, x.role, x.program, x.voicing ?? null, x.bassStyle ?? null]));

export function createPlayback(): PlaybackController {
  let song: Song | null = null;
  let tracks: Track[] = [];
  let sched: Schedule | null = null;
  let scheduledKey = '';
  let eventIds: number[] = [];
  let state: PlaybackState = 'stopped';
  let cursor = 1;
  let beat = 1;
  let loop = true;
  let output: OutputSelection = { kind: 'synth' };
  let sink: Sink | null = null;
  const listeners = new Set<(pos: PlaybackPosition) => void>();

  const total = () => (song ? totalMeasures(song) : 0);
  const clamp = (m: number) => Math.max(1, Math.min(Math.max(1, total()), Math.round(m)));
  const position = (): PlaybackPosition => ({ measure: cursor, beat, state, totalMeasures: total() });
  const emit = () => { const p = position(); for (const cb of listeners) cb(p); };

  function ensureSink(): Sink {
    if (!sink) {
      sink = output.kind === 'midi' ? new MidiSink(output.port) : new SynthSink();
      sink.prepare(tracks);
    }
    return sink;
  }

  function clearSchedule() {
    const t = Tone.getTransport();
    for (const id of eventIds) t.clear(id);
    eventIds = [];
    t.cancel(0);
    scheduledKey = '';
  }

  function schedule() {
    if (!song) return;
    clearSchedule();
    const t = Tone.getTransport();
    t.bpm.value = song.tempo;
    sched = buildSchedule(song);
    const { positions, notes, totalTicks, ticksPerBeat } = sched;

    for (const p of positions) {
      eventIds.push(t.schedule((time) => {
        Tone.getDraw().schedule(() => { cursor = p.measure; beat = p.beat; emit(); }, time);
      }, ticks(p.tick)));
    }
    for (const n of notes) {
      eventIds.push(t.schedule((time) => {
        const track = tracks.find((x) => x.id === n.trackId);
        if (!track || !audibleTracks(tracks).includes(track)) return;
        const durSec = Tone.getTransport().toSeconds(ticks(n.durationTicks));
        ensureSink().play(track, n.notes, n.velocity, durSec, time);
      }, ticks(n.tick)));
    }
    void ticksPerBeat;
    eventIds.push(t.schedule(() => { if (!loop) api.stop(); }, ticks(totalTicks - 1)));
    t.loopStart = ticks(0);
    t.loopEnd = ticks(totalTicks);
    t.loop = loop;
    scheduledKey = structuralKey(song) + trackShapeKey(tracks);
  }

  function moveTransportToCursor() {
    sink?.allOff();
    Tone.getTransport().ticks = sched?.measureStartTicks[cursor - 1] ?? 0;
    beat = 1;
  }

  function reschedule() {
    const t = Tone.getTransport();
    const wasPlaying = state === 'playing';
    if (wasPlaying) t.pause();
    schedule();
    moveTransportToCursor();
    if (wasPlaying) t.start();
  }

  const api: PlaybackController = {
    setSong(s) {
      const prev = song;
      song = s;
      tracks = songTracks(s);
      cursor = clamp(cursor);
      const key = structuralKey(s) + trackShapeKey(tracks);
      if (state !== 'stopped' && prev) {
        if (key !== scheduledKey) reschedule();
        else if (prev.tempo !== s.tempo) Tone.getTransport().bpm.value = s.tempo;
      }
      // Mixer / instrument changes apply live.
      if (sink && JSON.stringify(prev?.tracks ?? null) !== JSON.stringify(s.tracks ?? null)) sink.prepare(tracks);
      emit();
    },
    setOutput(sel) {
      const same = sel.kind === output.kind && (sel.kind !== 'midi' || (output as { port?: MIDIOutput }).port?.id === sel.port.id);
      if (same) return;
      sink?.dispose();
      sink = null;
      output = sel;
      if (state !== 'stopped') ensureSink();
    },
    getOutput: () => output,
    async play(fromMeasure) {
      if (!song) return;
      await Tone.start();
      ensureSink();
      const t = Tone.getTransport();
      if (fromMeasure !== undefined) cursor = clamp(fromMeasure);
      const key = structuralKey(song) + trackShapeKey(tracks);
      if (state === 'paused' && scheduledKey === key && fromMeasure === undefined) {
        state = 'playing'; t.start(); emit(); return;
      }
      if (scheduledKey !== key) schedule();
      moveTransportToCursor();
      state = 'playing';
      t.start();
      emit();
    },
    pause() {
      if (state !== 'playing') return;
      Tone.getTransport().pause();
      sink?.allOff();
      state = 'paused';
      emit();
    },
    stop() {
      const t = Tone.getTransport();
      t.stop();
      t.ticks = 0;
      sink?.allOff();
      state = 'stopped';
      cursor = 1;
      beat = 1;
      emit();
    },
    seek(measure) {
      cursor = clamp(measure);
      if (state !== 'stopped') {
        if (song && scheduledKey !== structuralKey(song) + trackShapeKey(tracks)) schedule();
        moveTransportToCursor();
      }
      beat = 1;
      emit();
    },
    next() { api.seek(cursor + 1); },
    prev() { api.seek(cursor - 1); },
    toStart() { api.seek(1); },
    toEnd() { api.seek(total()); },
    setLoop(l) { loop = l; Tone.getTransport().loop = l; },
    getPosition: position,
    onPosition(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    dispose() { api.stop(); clearSchedule(); sink?.dispose(); sink = null; },
  };
  return api;
}

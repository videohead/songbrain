/**
 * Output sinks: where scheduled notes go.
 *  - MidiSink: Web MIDI output port (primary). Program/CC per track channel.
 *  - SynthSink: built-in Tone.js synths (fallback), one voice chain per track.
 * Times are AudioContext seconds (Tone's clock); MidiSink converts to performance.now() ms.
 */
import * as Tone from 'tone';
import { Note } from 'tonal';
import type { Track } from '../model/song';
import { gmFamily } from '../model/gm';

export interface Sink {
  /** Send program changes and mixer controllers for these tracks. */
  prepare(tracks: Track[]): void;
  play(track: Track, notes: string[], velocity: number, durationSec: number, time: number): void;
  allOff(): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------

export class MidiSink implements Sink {
  private channels = new Set<number>();
  constructor(private port: MIDIOutput) {}

  private ts(time: number): number {
    const raw = Tone.getContext().rawContext as AudioContext;
    return performance.now() + Math.max(0, (time - raw.currentTime) * 1000);
  }

  prepare(tracks: Track[]) {
    for (const t of tracks) {
      const ch = (t.channel - 1) & 0x0f;
      this.channels.add(ch);
      this.port.send([0xc0 | ch, t.program & 0x7f]);
      this.port.send([0xb0 | ch, 7, t.level & 0x7f]);
      this.port.send([0xb0 | ch, 10, t.pan & 0x7f]);
      this.port.send([0xb0 | ch, 91, t.reverb & 0x7f]);
    }
  }

  play(track: Track, notes: string[], velocity: number, durationSec: number, time: number) {
    const ch = (track.channel - 1) & 0x0f;
    const on = this.ts(time);
    const off = on + durationSec * 1000;
    for (const n of notes) {
      const midi = Note.midi(n);
      if (midi == null) continue;
      this.port.send([0x90 | ch, midi, velocity & 0x7f], on);
      this.port.send([0x80 | ch, midi, 0], off);
    }
  }

  allOff() {
    try { (this.port as MIDIOutput & { clear?: () => void }).clear?.(); } catch { /* not all browsers implement clear */ }
    for (const ch of this.channels) {
      this.port.send([0xb0 | ch, 123, 0]); // all notes off
      this.port.send([0xb0 | ch, 120, 0]); // all sound off
    }
  }

  dispose() { this.allOff(); }
}

// ---------------------------------------------------------------------------

interface Chain { synth: Tone.PolySynth; gain: Tone.Gain; pan: Tone.Panner; send: Tone.Gain; program: number }

/** Rough timbre per GM family so the fallback is not one sound for everything. */
function synthOptionsFor(program: number): Partial<Tone.SynthOptions> {
  switch (gmFamily(program)) {
    case 'Piano': return { oscillator: { type: 'triangle8' }, envelope: { attack: 0.005, decay: 0.6, sustain: 0.25, release: 0.8 } } as Partial<Tone.SynthOptions>;
    case 'Chromatic Percussion': return { oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 0.5 } } as Partial<Tone.SynthOptions>;
    case 'Organ': return { oscillator: { type: 'sine4' }, envelope: { attack: 0.02, decay: 0.1, sustain: 0.9, release: 0.1 } } as Partial<Tone.SynthOptions>;
    case 'Guitar': return { oscillator: { type: 'triangle4' }, envelope: { attack: 0.003, decay: 0.8, sustain: 0.1, release: 0.4 } } as Partial<Tone.SynthOptions>;
    case 'Bass': return { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.4, sustain: 0.6, release: 0.3 } } as Partial<Tone.SynthOptions>;
    case 'Strings': case 'Ensemble': case 'Synth Pad': return { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.25, decay: 0.3, sustain: 0.8, release: 0.8 } } as Partial<Tone.SynthOptions>;
    case 'Brass': case 'Reed': return { oscillator: { type: 'square8' }, envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.3 } } as Partial<Tone.SynthOptions>;
    case 'Pipe': return { oscillator: { type: 'sine2' }, envelope: { attack: 0.08, decay: 0.2, sustain: 0.8, release: 0.3 } } as Partial<Tone.SynthOptions>;
    default: return { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.4 } } as Partial<Tone.SynthOptions>;
  }
}

interface DrumKit { kick: Tone.MembraneSynth; snare: Tone.NoiseSynth; hat: Tone.MetalSynth; ride: Tone.MetalSynth; tom: Tone.MembraneSynth; gain: Tone.Gain; pan: Tone.Panner; send: Tone.Gain }

export class SynthSink implements Sink {
  private chains = new Map<string, Chain>();
  private kits = new Map<string, DrumKit>();
  private reverb = new Tone.Reverb({ decay: 1.8, wet: 1 }).toDestination();

  private kitFor(t: Track): DrumKit {
    let k = this.kits.get(t.id);
    if (!k) {
      const gain = new Tone.Gain(0).toDestination();
      const pan = new Tone.Panner(0).connect(gain);
      const send = new Tone.Gain(0).connect(this.reverb);
      const mk = <T extends Tone.ToneAudioNode>(n: T) => { n.connect(pan); n.connect(send); return n; };
      k = {
        kick: mk(new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 6, envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 }, volume: -4 })),
        snare: mk(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.05 }, volume: -10 })),
        hat: mk(new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.06, release: 0.02 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5, volume: -22 })),
        ride: mk(new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.5, release: 0.2 }, harmonicity: 3.2, modulationIndex: 20, resonance: 3200, octaves: 1.2, volume: -24 })),
        tom: mk(new Tone.MembraneSynth({ pitchDecay: 0.06, octaves: 3, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 }, volume: -8 })),
        gain, pan, send,
      };
      this.kits.set(t.id, k);
    }
    k.gain.gain.value = Math.pow(t.level / 127, 2);
    k.pan.pan.value = (t.pan - 64) / 64;
    k.send.gain.value = Math.pow(t.reverb / 127, 2) * 0.6;
    return k;
  }

  private playDrum(k: DrumKit, midi: number, vel: number, time: number) {
    const v = vel / 127;
    if (midi === 35 || midi === 36) k.kick.triggerAttackRelease('C1', 0.2, time, v);
    else if (midi === 38 || midi === 40 || midi === 39) k.snare.triggerAttackRelease(0.18, time, v);
    else if (midi === 37) k.snare.triggerAttackRelease(0.04, time, v * 0.7);
    else if (midi === 42 || midi === 44) k.hat.triggerAttackRelease('C6', 0.05, time, v * 0.8);
    else if (midi === 46) k.hat.triggerAttackRelease('C6', 0.3, time, v * 0.8);
    else if (midi === 51 || midi === 53) k.ride.triggerAttackRelease('C6', 0.4, time, v);
    else if (midi === 49 || midi === 57) k.ride.triggerAttackRelease('A5', 1.2, time, v);
    else if (midi >= 41 && midi <= 50) k.tom.triggerAttackRelease(midi >= 48 ? 'A2' : midi >= 45 ? 'E2' : 'A1', 0.3, time, v);
    else k.hat.triggerAttackRelease('C6', 0.05, time, v * 0.6);
  }

  private chainFor(t: Track): Chain {
    let c = this.chains.get(t.id);
    if (c && c.program !== t.program) { this.destroy(c); c = undefined; }
    if (!c) {
      const gain = new Tone.Gain(0).toDestination();
      const pan = new Tone.Panner(0).connect(gain);
      const send = new Tone.Gain(0).connect(this.reverb);
      const synth = new Tone.PolySynth(Tone.Synth, synthOptionsFor(t.program) as any);
      synth.volume.value = -10;
      synth.connect(pan);
      synth.connect(send);
      c = { synth, gain, pan, send, program: t.program };
      this.chains.set(t.id, c);
    }
    this.apply(c, t);
    return c;
  }

  private apply(c: Chain, t: Track) {
    c.gain.gain.value = Math.pow(t.level / 127, 2);
    c.pan.pan.value = (t.pan - 64) / 64;
    c.send.gain.value = Math.pow(t.reverb / 127, 2) * 0.6;
  }

  private destroy(c: Chain) { c.synth.dispose(); c.gain.dispose(); c.pan.dispose(); c.send.dispose(); }

  prepare(tracks: Track[]) {
    for (const t of tracks) t.role === 'drums' ? this.kitFor(t) : this.chainFor(t);
    for (const id of [...this.chains.keys()]) if (!tracks.some((t) => t.id === id && t.role !== 'drums')) { this.destroy(this.chains.get(id)!); this.chains.delete(id); }
    for (const id of [...this.kits.keys()]) if (!tracks.some((t) => t.id === id && t.role === 'drums')) { this.destroyKit(this.kits.get(id)!); this.kits.delete(id); }
  }

  play(track: Track, notes: string[], velocity: number, durationSec: number, time: number) {
    if (track.role === 'drums') {
      const k = this.kitFor(track);
      for (const n of notes) { const m = Note.midi(n); if (m != null) this.playDrum(k, m, velocity, time); }
      return;
    }
    this.chainFor(track).synth.triggerAttackRelease(notes, durationSec, time, velocity / 127);
  }

  allOff() { for (const c of this.chains.values()) c.synth.releaseAll(); }

  private destroyKit(k: DrumKit) { k.kick.dispose(); k.snare.dispose(); k.hat.dispose(); k.ride.dispose(); k.tom.dispose(); k.gain.dispose(); k.pan.dispose(); k.send.dispose(); }

  dispose() { for (const c of this.chains.values()) this.destroy(c); this.chains.clear(); for (const k of this.kits.values()) this.destroyKit(k); this.kits.clear(); this.reverb.dispose(); }
}

/** Web MIDI output discovery and per-browser port selection. */
export interface MidiPortInfo { id: string; name: string; manufacturer: string }

const KEY = 'songbrain.midi.port';

export function midiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
}

let accessPromise: Promise<MIDIAccess | null> | null = null;

/** Request access once (Chrome prompts the first time). Resolves null if unsupported or denied. */
export function requestMidiAccess(): Promise<MIDIAccess | null> {
  if (!midiSupported()) return Promise.resolve(null);
  if (!accessPromise) accessPromise = navigator.requestMIDIAccess({ sysex: false }).catch(() => null);
  return accessPromise;
}

export function listOutputs(access: MIDIAccess): MidiPortInfo[] {
  return [...access.outputs.values()].map((o) => ({ id: o.id, name: o.name ?? o.id, manufacturer: o.manufacturer ?? '' }));
}

export function loadPortSelection(): string {
  try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}
export function savePortSelection(id: string) {
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* ignore */ }
}

import type { Track, TrackRole } from '../model/song';
import { GM_FAMILIES, GM_PROGRAMS } from '../model/gm';
import type { MidiPortInfo } from '../engine/midiOut';
import { BASS_STYLES, VOICING_STYLES, defaultVoicingFor } from '../engine/voicing';
import { Knob } from './Knob';
import { GM_DRUM_KITS } from '../model/style';

export interface OutputState {
  supported: boolean;
  ports: MidiPortInfo[];
  /** '' = built-in synth */
  selectedId: string;
  error?: string;
}

interface Props {
  tracks: Track[];
  output: OutputState;
  onChange: (tracks: Track[], label: string, coalesce?: boolean) => void;
  onSelectOutput: (id: string) => void;
  onRefreshPorts: () => void;
  onCollapse: () => void;
}

export function TrackPanel({ tracks, output, onChange, onSelectOutput, onRefreshPorts, onCollapse }: Props) {
  const update = (id: string, patch: Partial<Track>, label: string, coalesce = false) =>
    onChange(tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)), label, coalesce);

  const add = (role: TrackRole) => {
    const used = new Set(tracks.map((t) => t.channel));
    let channel = 1;
    while (used.has(channel) || channel === 10) channel++;
    const n = tracks.filter((t) => t.role === role).length + 1;
    const stamp = Date.now().toString(36);
    const base: Track = role === 'bass'
      ? { id: `bass${n}-${stamp}`, name: `Bass ${n}`, role, program: 33, channel, level: 110, pan: 64, reverb: 10, mute: false, solo: false }
      : role === 'drums'
        ? { id: `drums${n}-${stamp}`, name: `Drums ${n}`, role, program: 0, channel: 10, level: 100, pan: 64, reverb: 20, mute: false, solo: false }
        : { id: `chords${n}-${stamp}`, name: `Comp ${n}`, role, program: 4, channel, level: 90, pan: 64, reverb: 30, mute: false, solo: false };
    onChange([...tracks, base], `Added track ${base.name}`);
  };

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/60">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs border-b border-zinc-800/60">
        <span className="font-semibold text-sm">Mixer</span>
        <label className="flex items-center gap-1 text-zinc-400">Output
          <select className="field" value={output.selectedId} onChange={(e) => onSelectOutput(e.target.value)}>
            <option value="">Built-in synth</option>
            {output.ports.map((p) => <option key={p.id} value={p.id}>{p.name}{p.manufacturer ? ` (${p.manufacturer})` : ''}</option>)}
          </select>
        </label>
        <button className="btn" onClick={onRefreshPorts} disabled={!output.supported} title={output.supported ? 'Scan for MIDI output ports' : 'Web MIDI is not supported in this browser (Safari)'}>
          {output.supported ? 'Scan MIDI ports' : 'No Web MIDI'}
        </button>
        {output.error && <span className="text-rose-300">{output.error}</span>}
        <div className="ml-auto flex gap-1">
          <button className="btn" onClick={() => add('chords')}>+ Comp</button>
          <button className="btn" onClick={() => add('bass')}>+ Bass</button>
          <button className="btn" onClick={() => add('drums')} disabled={tracks.some((t) => t.role === 'drums')}>+ Drums</button>
          <button className="btn" onClick={onCollapse} title="Collapse mixer">▲ Collapse</button>
        </div>
      </div>

      <div className="flex gap-px overflow-x-auto bg-zinc-800 px-px">
        {tracks.map((t) => <Strip key={t.id} t={t} tracks={tracks} update={update} onChange={onChange} />)}
      </div>
    </div>
  );
}

interface StripProps {
  t: Track;
  tracks: Track[];
  update: (id: string, patch: Partial<Track>, label: string, coalesce?: boolean) => void;
  onChange: Props['onChange'];
}

function Strip({ t, tracks, update, onChange }: StripProps) {
  const dim = t.mute || (tracks.some((x) => x.solo) && !t.solo);
  return (
    <div className={`w-32 shrink-0 flex flex-col items-stretch gap-1.5 bg-zinc-950 px-2 pt-2 pb-1.5 ${dim ? 'opacity-60' : ''}`}>
      {/* Instrument & style, top of strip like inserts */}
      {t.role === 'drums' ? (
        <select className="field !px-1 !py-0.5 text-[10px] w-full" value={t.program} onChange={(e) => update(t.id, { program: Number(e.target.value) }, `Set ${t.name} kit`)} title="Drum kit (GM, channel 10)">
          {GM_DRUM_KITS.map((k) => <option key={k.program} value={k.program}>{k.name}</option>)}
        </select>
      ) : (
      <select className="field !px-1 !py-0.5 text-[10px] w-full" value={t.program} onChange={(e) => update(t.id, { program: Number(e.target.value) }, `Set ${t.name} instrument`)} title={GM_PROGRAMS[t.program]}>
        {GM_FAMILIES.map((fam, fi) => (
          <optgroup key={fam} label={fam}>
            {GM_PROGRAMS.slice(fi * 8, fi * 8 + 8).map((name, i) => <option key={fi * 8 + i} value={fi * 8 + i}>{name}</option>)}
          </optgroup>
        ))}
      </select>
      )}
      {t.role === 'drums' ? (
        <div className="text-[10px] text-zinc-500 text-center py-0.5">pattern from section style</div>
      ) : t.role === 'chords' ? (
        <select className="field !px-1 !py-0.5 text-[10px] w-full" value={t.voicing ?? ''} onChange={(e) => update(t.id, { voicing: (e.target.value || undefined) as Track['voicing'] }, `Set ${t.name} voicing`)} title="Voicing style">
          <option value="">Auto · {VOICING_STYLES.find((v) => v.id === defaultVoicingFor(t.program))?.label.split(' ')[0]}</option>
          {VOICING_STYLES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      ) : (
        <select className="field !px-1 !py-0.5 text-[10px] w-full" value={t.bassStyle ?? 'roots-fifths'} onChange={(e) => update(t.id, { bassStyle: e.target.value as Track['bassStyle'] }, `Set ${t.name} bass style`)} title="Bass line style">
          {BASS_STYLES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      )}
      <label className="flex items-center justify-between text-[10px] text-zinc-500">
        <span>MIDI ch</span>
        <select className="field !px-1 !py-0 text-[10px]" value={t.channel} onChange={(e) => update(t.id, { channel: Number(e.target.value) }, `Set ${t.name} channel`)}>
          {Array.from({ length: 16 }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      {/* Knobs */}
      <div className="flex justify-around pt-1">
        <Knob label="Send" value={t.reverb} defaultValue={20} onChange={(v) => update(t.id, { reverb: v }, `${t.name} reverb`, true)} />
        <Knob label="Pan" value={t.pan} bipolar onChange={(v) => update(t.id, { pan: v }, `${t.name} pan`, true)} />
      </div>

      {/* Fader */}
      <div className="flex flex-col items-center gap-1 pt-1">
        <span className="text-[10px] font-mono text-zinc-300 bg-zinc-900 border border-zinc-700 rounded px-1 w-12 text-center">{t.level}</span>
        <input
          type="range" min={0} max={127} value={t.level}
          className="fader"
          onChange={(e) => update(t.id, { level: Number(e.target.value) }, `${t.name} level`, true)}
          onDoubleClick={() => update(t.id, { level: 100 }, `${t.name} level`)}
          title="Level (CC 7). Double-click resets to 100."
        />
      </div>

      {/* Mute / Solo */}
      <div className="flex gap-1 justify-center">
        <button className={`strip-btn ${t.mute ? 'bg-sky-500 text-zinc-950 border-sky-400' : ''}`} onClick={() => update(t.id, { mute: !t.mute }, `${t.mute ? 'Unmuted' : 'Muted'} ${t.name}`)} title="Mute">M</button>
        <button className={`strip-btn ${t.solo ? 'bg-purple-400 text-zinc-950 border-purple-300' : ''}`} onClick={() => update(t.id, { solo: !t.solo }, `${t.solo ? 'Unsoloed' : 'Soloed'} ${t.name}`)} title="Solo">S</button>
        <button className="strip-btn text-zinc-500 hover:text-rose-300" disabled={tracks.length === 1} onClick={() => onChange(tracks.filter((x) => x.id !== t.id), `Removed track ${t.name}`)} title="Remove track">×</button>
      </div>

      {/* Name plate */}
      <input
        className={`w-full text-center text-[11px] font-semibold rounded px-1 py-0.5 border focus:outline-none focus:border-purple-400 ${t.role === 'bass' ? 'bg-emerald-900/50 border-emerald-800 text-emerald-100' : t.role === 'drums' ? 'bg-rose-900/50 border-rose-800 text-rose-100' : 'bg-sky-900/50 border-sky-800 text-sky-100'}`}
        value={t.name}
        onChange={(e) => update(t.id, { name: e.target.value }, 'Renamed track', true)}
      />
    </div>
  );
}

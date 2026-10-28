import { useEffect, useRef, useState } from 'react';
import { DEFAULT_STYLE_ID } from '../engine/style/presets';
import type { Song } from '../model/song';
import type { PlaybackController, PlaybackPosition } from '../engine/playback';
import { songFromJson, songToJson } from '../engine/export/json';
import { songFromMusicXml } from '../engine/import/musicxml';
import { songToMidi } from '../engine/export/midi';
import { songToMusicXml } from '../engine/export/musicxml';
import type { Style } from '../model/style';
import { normalizeStyle } from '../model/style';
import { availableStyles } from '../engine/style/resolve';

interface Props {
  song: Song;
  position: PlaybackPosition;
  loop: boolean;
  playback: PlaybackController;
  onToggleLoop: () => void;
  onChange: (patch: Partial<Song>, label: string) => void;
  onLoad: (song: Song) => void;
  /** A Roland PMA-5 backup (.syx) was chosen. */
  onImportPma5: (bytes: Uint8Array, fileName: string) => void;
  mixerOpen: boolean;
  onToggleMixer: () => void;
  styleOpen: boolean;
  onToggleStyle: () => void;
  outputLabel: string;
}

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Transport({ song, position, loop, playback, onToggleLoop, onChange, onLoad, onImportPma5, mixerOpen, onToggleMixer, styleOpen, onToggleStyle, outputLabel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  // Styles saved in the server library (e.g. learned from MIDI) are offered too; picking one embeds it in the song.
  const [library, setLibrary] = useState<Style[]>([]);
  useEffect(() => {
    fetch('/api/styles').then((r) => r.json()).then((l: Style[]) => setLibrary(l.map(normalizeStyle))).catch(() => {});
  }, [song.styles]);
  const pickerStyles = [...availableStyles(song), ...library.filter((l) => !availableStyles(song).some((x) => x.id === l.id))];
  const safe = song.title.replace(/[^\w\- ]+/g, '').trim() || 'song';
  const playing = position.state === 'playing';
  const atStart = position.measure <= 1;
  const atEnd = position.measure >= position.totalMeasures;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900/30">
      <div className="flex items-center gap-1">
        <button className="btn" onClick={() => fileRef.current?.click()} title="Open a Song Brain JSON file, a MusicXML lead sheet (.musicxml / .xml) or a Roland PMA-5 backup (.syx)">Open…</button>
        <input ref={fileRef} type="file" accept=".json,.syx,application/json,.musicxml,.xml,application/vnd.recordare.musicxml+xml,application/xml,text/xml" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            if (/\.syx$/i.test(f.name)) { onImportPma5(new Uint8Array(await f.arrayBuffer()), f.name); e.target.value = ''; return; }
            const textContent = await f.text();
            if (/\.(musicxml|xml)$/i.test(f.name) || textContent.trimStart().startsWith('<')) {
              const { song: imported, warnings } = songFromMusicXml(textContent, f.name.replace(/\.[^.]+$/, ''));
              onLoad(imported);
              if (warnings.length) alert('Imported with warnings:\n' + warnings.join('\n'));
            } else onLoad(songFromJson(textContent));
          } catch (err) { alert((err as Error).message); }
          e.target.value = '';
        }} />
        <svg className="mx-1 text-zinc-500" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Save / export">
          <title>Save / export</title>
          <path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M7 3v5h8V3M7 21v-7h10v7" />
        </svg>
        <button className="btn" onClick={() => download(`${safe}.json`, songToJson(song), 'application/json')}>JSON</button>
        <button className="btn" onClick={() => download(`${safe}.mid`, songToMidi(song), 'audio/midi')}>MIDI</button>
        <button className="btn" onClick={() => download(`${safe}.musicxml`, songToMusicXml(song), 'application/vnd.recordare.musicxml+xml')}>MusicXML</button>
      </div>

      {/* Transport cluster */}
      <div className="flex items-center rounded-md border border-zinc-700 bg-zinc-900 overflow-hidden">
        <TBtn title="Go to beginning (Home)" onClick={() => playback.toStart()} disabled={atStart}>⏮</TBtn>
        <TBtn title="Previous measure (,)" onClick={() => playback.prev()} disabled={atStart}>◀◀</TBtn>
        <TBtn
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          onClick={() => (playing ? playback.pause() : void playback.play())}
          className={`w-14 font-semibold ${playing ? 'bg-purple-500/20 text-purple-300' : 'text-emerald-300'}`}
        >
          {playing ? '❚❚' : '▶'}
        </TBtn>
        <TBtn title="Stop (Esc)" onClick={() => playback.stop()} disabled={position.state === 'stopped'} className="text-rose-300">■</TBtn>
        <TBtn title="Next measure (.)" onClick={() => playback.next()} disabled={atEnd}>▶▶</TBtn>
        <TBtn title="Go to end (End)" onClick={() => playback.toEnd()} disabled={atEnd}>⏭</TBtn>
      </div>

      {/* Position readout */}
      <div className="font-mono text-xs tabular-nums text-zinc-300 bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 min-w-[7.5rem] text-center" title="measure . beat / total">
        <span className={position.state === 'playing' ? 'text-purple-300' : position.state === 'paused' ? 'text-sky-300' : 'text-zinc-400'}>
          {position.state === 'stopped' ? '■' : position.state === 'paused' ? '❚❚' : '▶'}
        </span>{' '}
        m.{String(position.measure).padStart(3, ' ')}.{position.beat} / {position.totalMeasures}
      </div>

      <label className="flex items-center gap-1 text-xs text-zinc-400">
        <input type="checkbox" checked={loop} onChange={onToggleLoop} className="accent-purple-400" /> Loop
      </label>
      <button className={`btn ${mixerOpen ? '!bg-zinc-700' : ''}`} onClick={onToggleMixer} title="Tracks, instruments, levels and MIDI output">Mixer · {outputLabel}</button>
      <button className={`btn ${styleOpen ? '!bg-zinc-700' : ''}`} onClick={onToggleStyle} title="Edit patterns and feel of the current section's style">Style editor</button>

      <input className="field w-48 font-semibold" value={song.title} onChange={(e) => onChange({ title: e.target.value }, 'Renamed song')} />
      <label className="text-xs text-zinc-400 flex items-center gap-1">Key
        <input className="field w-24" value={song.key} onChange={(e) => onChange({ key: e.target.value }, 'Changed key label')} />
      </label>
      <label className="text-xs text-zinc-400 flex items-center gap-1">Tempo
        <input className="field w-16" type="number" min={30} max={300} value={song.tempo} onChange={(e) => onChange({ tempo: Number(e.target.value) || 120 }, 'Changed tempo')} />
      </label>
      <label className="text-xs text-zinc-400 flex items-center gap-1" title="Default playing style (sections can override)">Style
        <select className="field" value={song.arrangement?.defaultStyle ?? DEFAULT_STYLE_ID} onChange={(e) => {
          const id = e.target.value;
          const lib = song.styles?.[id] ? null : library.find((l) => l.id === id && !availableStyles(song).some((x) => x.id === id));
          onChange({ ...(lib ? { styles: { ...(song.styles ?? {}), [id]: lib } } : {}), arrangement: { ...(song.arrangement ?? {}), defaultStyle: id } }, 'Changed default style');
        }}>
          {pickerStyles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-zinc-400 flex items-center gap-1">Meter
        <select className="field" value={song.meter} onChange={(e) => onChange({ meter: e.target.value }, 'Changed meter')}>
          {['4/4', '3/4', '2/4', '6/8', '5/4'].map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>

    </div>
  );
}

function TBtn({ children, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`px-2.5 py-1 text-sm border-r border-zinc-700 last:border-r-0 hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

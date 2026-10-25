import { useRef } from 'react';
import type { Song } from '../model/song';
import type { PlaybackController, PlaybackPosition } from '../engine/playback';
import { songFromJson, songToJson } from '../engine/export/json';
import { songFromMusicXml } from '../engine/import/musicxml';
import { songToMidi } from '../engine/export/midi';
import { songToMusicXml } from '../engine/export/musicxml';
import { availableStyles } from '../engine/style/resolve';

interface Props {
  song: Song;
  position: PlaybackPosition;
  loop: boolean;
  playback: PlaybackController;
  onToggleLoop: () => void;
  onChange: (patch: Partial<Song>, label: string) => void;
  onLoad: (song: Song) => void;
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

export function Transport({ song, position, loop, playback, onToggleLoop, onChange, onLoad, mixerOpen, onToggleMixer, styleOpen, onToggleStyle, outputLabel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const safe = song.title.replace(/[^\w\- ]+/g, '').trim() || 'song';
  const playing = position.state === 'playing';
  const atStart = position.measure <= 1;
  const atEnd = position.measure >= position.totalMeasures;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900/30">
      {/* Transport cluster */}
      <div className="flex items-center rounded-md border border-zinc-700 bg-zinc-900 overflow-hidden">
        <TBtn title="Go to beginning (Home)" onClick={() => playback.toStart()} disabled={atStart}>⏮</TBtn>
        <TBtn title="Previous measure (,)" onClick={() => playback.prev()} disabled={atStart}>◀◀</TBtn>
        <TBtn
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          onClick={() => (playing ? playback.pause() : void playback.play())}
          className={`w-14 font-semibold ${playing ? 'bg-amber-500/20 text-amber-300' : 'text-emerald-300'}`}
        >
          {playing ? '❚❚' : '▶'}
        </TBtn>
        <TBtn title="Stop (Esc)" onClick={() => playback.stop()} disabled={position.state === 'stopped'} className="text-rose-300">■</TBtn>
        <TBtn title="Next measure (.)" onClick={() => playback.next()} disabled={atEnd}>▶▶</TBtn>
        <TBtn title="Go to end (End)" onClick={() => playback.toEnd()} disabled={atEnd}>⏭</TBtn>
      </div>

      {/* Position readout */}
      <div className="font-mono text-xs tabular-nums text-zinc-300 bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 min-w-[7.5rem] text-center" title="measure . beat / total">
        <span className={position.state === 'playing' ? 'text-amber-300' : position.state === 'paused' ? 'text-sky-300' : 'text-zinc-400'}>
          {position.state === 'stopped' ? '■' : position.state === 'paused' ? '❚❚' : '▶'}
        </span>{' '}
        m.{String(position.measure).padStart(3, ' ')}.{position.beat} / {position.totalMeasures}
      </div>

      <label className="flex items-center gap-1 text-xs text-zinc-400">
        <input type="checkbox" checked={loop} onChange={onToggleLoop} className="accent-amber-400" /> Loop
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
        <select className="field" value={song.arrangement?.defaultStyle ?? 'swing'} onChange={(e) => onChange({ arrangement: { ...(song.arrangement ?? {}), defaultStyle: e.target.value } }, 'Changed default style')}>
          {availableStyles(song).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-zinc-400 flex items-center gap-1">Meter
        <select className="field" value={song.meter} onChange={(e) => onChange({ meter: e.target.value }, 'Changed meter')}>
          {['4/4', '3/4', '2/4', '6/8', '5/4'].map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-1">
        <span className="text-xs text-zinc-500 mr-1">Export</span>
        <button className="btn" onClick={() => download(`${safe}.json`, songToJson(song), 'application/json')}>JSON</button>
        <button className="btn" onClick={() => download(`${safe}.mid`, songToMidi(song), 'audio/midi')}>MIDI</button>
        <button className="btn" onClick={() => download(`${safe}.musicxml`, songToMusicXml(song), 'application/vnd.recordare.musicxml+xml')}>MusicXML</button>
        <button className="btn" onClick={() => fileRef.current?.click()} title="Open a Song Brain JSON file or a MusicXML lead sheet (.musicxml / .xml)">Open…</button>
        <input ref={fileRef} type="file" accept=".json,application/json,.musicxml,.xml,application/vnd.recordare.musicxml+xml,application/xml,text/xml" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const textContent = await f.text();
            if (/\.(musicxml|xml)$/i.test(f.name) || textContent.trimStart().startsWith('<')) {
              const { song: imported, warnings } = songFromMusicXml(textContent, f.name.replace(/\.[^.]+$/, ''));
              onLoad(imported);
              if (warnings.length) alert('Imported with warnings:\n' + warnings.join('\n'));
            } else onLoad(songFromJson(textContent));
          } catch (err) { alert((err as Error).message); }
          e.target.value = '';
        }} />
      </div>
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

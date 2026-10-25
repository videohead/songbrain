import { useEffect, useMemo, useRef, useState } from 'react';
import { createPlayback, type PlaybackPosition } from '../engine/playback';
import { ChordGrid } from './ChordGrid';
import { ChatPanel } from './ChatPanel';
import { Transport } from './Transport';
import { useSongHistory } from './useSongHistory';
import { useRelay } from './useRelay';
import { TrackPanel } from './TrackPanel';
import { StyleEditor } from './StyleEditor';
import { SheetView } from './SheetView';
import { useMidiOutput } from './useMidiOutput';
import { songTracks, flattenMeasures } from '../model/song';
import { createServerLoopAdapter } from '../agent/adapter';
import { loadLlmSettings } from '../agent/llmSettings';
import { RoleBanner, RolePill } from './RoleBanner';

export default function App() {
  const history = useSongHistory();
  const { song, commit } = history;
  const playback = useMemo(() => createPlayback(), []);
  const chatAdapter = useMemo(() => createServerLoopAdapter(loadLlmSettings), []);
  const [position, setPosition] = useState<PlaybackPosition>(() => playback.getPosition());
  const [loop, setLoop] = useState(true);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [view, setView] = useState<'grid' | 'sheet'>('grid');
  const [chatOpen, setChatOpen] = useState(true);
  const midi = useMidiOutput(playback);
  const relay = useRelay(history.store, song, (s, label) => history.applyRemote(s, label));
  const readOnly = relay.role === 'readonly';
  const [selection, setSelection] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => { history.setContext({ cursorMeasure: position.measure, selection, playback: position.state }); }, [position.measure, position.state, selection, history.setContext]);

  // Agent audition: loop-play a section from its first measure.
  useEffect(() => {
    history.setAudition((si) => {
      const start = flattenMeasures(songRefForAudition.current).findIndex((m) => m.sectionIndex === si) + 1;
      playback.setLoop(true); setLoop(true);
      void playback.play(Math.max(1, start));
    });
  }, [history.setAudition, playback]);
  const songRefForAudition = useRef(song); songRefForAudition.current = song;

  // Transport lock: a read-only tab never plays.
  useEffect(() => { if (readOnly) playback.stop(); }, [readOnly, playback]);

  useEffect(() => playback.onPosition(setPosition), [playback]);
  useEffect(() => () => playback.dispose(), [playback]);

  // The engine always derives audio from the latest song; the cursor is kept across edits.
  useEffect(() => { playback.setSong(song); }, [song, playback]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      if (typing || readOnly) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); return; }
      switch (e.key) {
        case ' ': e.preventDefault(); position.state === 'playing' ? playback.pause() : void playback.play(); break;
        case 'Home': e.preventDefault(); playback.toStart(); break;
        case 'End': e.preventDefault(); playback.toEnd(); break;
        case ',': e.preventDefault(); playback.prev(); break;
        case '.': e.preventDefault(); playback.next(); break;
        case 'Escape': if (position.state !== 'stopped') { e.preventDefault(); playback.stop(); } break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playback, position.state, history.undo, history.redo, readOnly]);

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-xl">◉</span>
          <h1 className="font-semibold tracking-tight">Song Brain</h1>
        </div>
        <span className="text-xs text-zinc-500 hidden md:inline">Chord progressions are the source of truth. Everything else is derived.</span>
        <div className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
          <RolePill role={relay.role} tabs={relay.tabs} />
          <button className="btn" onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)">↶ Undo</button>
          <button className="btn" onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
          <span className="truncate max-w-[16rem] text-zinc-500" title={history.label}>{history.label}</span>
        </div>
      </header>

      {readOnly && <RoleBanner onClaim={relay.claim} />}
      <div className="flex-1 min-h-0 flex">
        <main className="flex-1 min-w-0 flex flex-col" {...(readOnly ? { inert: '' as unknown as boolean } : {})}>
          <Transport
            song={song}
            position={position}
            loop={loop}
            playback={playback}
            onToggleLoop={() => { setLoop(!loop); playback.setLoop(!loop); }}
            onChange={(patch, label) => commit({ ...song, ...patch }, label)}
            onLoad={(s) => { playback.stop(); commit(s, `Loaded ${s.title}`); }}
            mixerOpen={mixerOpen}
            onToggleMixer={() => setMixerOpen((o) => !o)}
            styleOpen={styleOpen}
            onToggleStyle={() => setStyleOpen((o) => !o)}
            outputLabel={midi.output.selectedId ? (midi.output.ports.find((p) => p.id === midi.output.selectedId)?.name ?? 'MIDI') : 'synth'}
          />
          {styleOpen && (
            <StyleEditor
              song={song}
              cursorSection={(() => { const f = flattenMeasures(song); return f[Math.max(0, Math.min(f.length - 1, position.measure - 1))]?.sectionIndex ?? 0; })()}
              onChange={(s, label, coalesce) => commit(s, label, { coalesce })}
              onAudition={(si) => history.store.audition?.(si)}
              onStop={() => playback.stop()}
              playing={position.state === 'playing'}
              onClose={() => setStyleOpen(false)}
            />
          )}
          {mixerOpen && (
            <TrackPanel
              tracks={songTracks(song)}
              output={midi.output}
              onChange={(tracks, label, coalesce) => commit({ ...song, tracks }, label, { coalesce })}
              onSelectOutput={(id) => void midi.selectOutput(id)}
              onRefreshPorts={() => void midi.refreshPorts()}
              onCollapse={() => setMixerOpen(false)}
              onLearnStyle={async (file, name) => {
                try {
                  const buf = new Uint8Array(await file.arrayBuffer());
                  let bin = ''; for (const b of buf) bin += String.fromCharCode(b);
                  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `learned-${Date.now().toString(36)}`;
                  const res = await fetch('/api/styles/learn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ midiBase64: btoa(bin), chart: flattenMeasures(song).map((m) => m.measure), id, name, save: true, source: file.name }) });
                  const data = await res.json();
                  if (!data.ok) return `Learn failed: ${data.error}${data.errors ? ' · ' + data.errors.slice(0, 3).join('; ') : ''}`;
                  const r = data.report;
                  commit({ ...song, styles: { ...(song.styles ?? {}), [id]: data.style }, arrangement: { ...(song.arrangement ?? {}), defaultStyle: id } }, `Learned style ${name}`);
                  return `Learned "${name}": chart from bar ${r.startBar + 1}, ${r.chartBars} bars, ${r.endingBars}-bar ending, swing ${r.swing}, roles ${r.roles.filter((x: { role: string }) => x.role !== 'ignored').map((x: { track: string; role: string }) => `${x.track}→${x.role}`).join(', ')}. Set as default style.`;
                } catch (e) { return `Learn failed: ${(e as Error).message}`; }
              }}
            />
          )}
          <div className="flex items-center gap-2 px-4 pt-3 text-xs">
            <div className="flex rounded-md border border-zinc-700 overflow-hidden">
              {(['grid', 'sheet'] as const).map((v) => (
                <button key={v} className={`px-3 py-1 ${view === v ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`} onClick={() => setView(v)}>{v === 'grid' ? 'Chord grid' : 'Lead sheet'}</button>
              ))}
            </div>
            {view === 'sheet' && <span className="text-zinc-500">Read-only rendering of the chart. Edit in the grid or with the agent.</span>}
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-4">
            {view === 'grid'
              ? <ChordGrid song={song} position={position} onChange={commit} onPlayFrom={(m) => void playback.play(m)} onSeek={(m) => playback.seek(m)} onSelectionChange={setSelection} />
              : <SheetView song={song} currentMeasure={position.measure} />}
          </div>
        </main>
        {chatOpen ? (
          <aside className="w-[24rem] max-w-[90vw] shrink-0 border-l border-zinc-800 bg-zinc-900/40 flex flex-col">
            <ChatPanel adapter={chatAdapter} readOnly={readOnly} onCollapse={() => setChatOpen(false)} />
          </aside>
        ) : (
          <button className="shrink-0 w-8 border-l border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-amber-300 text-xs [writing-mode:vertical-rl] rotate-180 py-3" onClick={() => setChatOpen(true)} title="Open agent panel">Agent ▸</button>
        )}
      </div>
    </div>
  );
}

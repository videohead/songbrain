import { useEffect, useMemo, useRef, useState } from 'react';
import type { Measure, Song } from '../model/song';
import { beatsPerMeasure, flattenMeasures } from '../model/song';
import type { PlaybackPosition } from '../engine/playback';
import { availableStyles, styleForSection, styleIdForSection, substyleIdForSection } from '../engine/style/resolve';
import { analyzeProgression } from '../engine/harmony';
import { addSection, appendMeasure, deleteMeasures, insertMeasures, measureToText, parseMeasureText, removeSection, renameSection, setMeasure } from '../engine/progression';

interface Props {
  song: Song;
  position: PlaybackPosition;
  onChange: (song: Song, label: string) => void;
  onPlayFrom: (measure: number) => void;
  onSeek: (measure: number) => void;
  onSelectionChange?: (range: { from: number; to: number } | null) => void;
}

/** Selection is a contiguous range of global 1-based measure numbers. */
interface Selection { anchor: number; focus: number }

export function ChordGrid({ song, position, onChange, onPlayFrom, onSeek, onSelectionChange }: Props) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [clipboard, setClipboard] = useState<Measure[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [barsPerRow, setBarsPerRow] = useState<number>(() => { try { return Number(localStorage.getItem('songbrain.barsPerRow')) || 0; } catch { return 0; } });
  const [showAnalysis, setShowAnalysis] = useState<boolean>(() => { try { return localStorage.getItem('songbrain.analysis') === '1'; } catch { return false; } });
  const bpm = beatsPerMeasure(song);
  const autoBars = bpm === 3 || bpm === 6 ? 4 : bpm === 2 ? 8 : bpm === 5 || bpm === 7 ? 2 : 4;
  const cols = barsPerRow || autoBars;
  const analysis = useMemo(() => (showAnalysis ? analyzeProgression(song) : null), [song, showAnalysis]);
  const romanFor = (measureNumber: number, chordIndex: number) => {
    if (!analysis) return null;
    const list = analysis.chords.filter((c) => c.measure === measureNumber);
    return list[chordIndex] ?? null;
  };
  const flat = flattenMeasures(song);
  const gridRef = useRef<HTMLDivElement>(null);

  const selRange = selection ? [Math.min(selection.anchor, selection.focus), Math.max(selection.anchor, selection.focus)] : null;
  useEffect(() => { onSelectionChange?.(selRange ? { from: selRange[0], to: selRange[1] } : null); }, [selRange?.[0], selRange?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const isSelected = (n: number) => !!selRange && n >= selRange[0] && n <= selRange[1];

  function copy() {
    if (!selRange) return;
    setClipboard(flat.slice(selRange[0] - 1, selRange[1]).map((e) => JSON.parse(JSON.stringify(e.measure))));
  }
  function paste() {
    if (!selRange || clipboard.length === 0) return;
    // Paste overwrites starting at selection start, extending the song if needed.
    let out = song;
    clipboard.forEach((m, i) => {
      const n = selRange[0] + i;
      const addr = flattenMeasures(out)[n - 1];
      out = addr ? setMeasure(out, { sectionIndex: addr.sectionIndex, measureIndex: addr.measureIndex }, m) : insertMeasures(out, n, [m]);
    });
    onChange(out, `Pasted ${clipboard.length} measure(s) at ${selRange[0]}`);
    setSelection({ anchor: selRange[0], focus: selRange[0] + clipboard.length - 1 });
  }
  function insertAfter() {
    if (!selRange) return;
    onChange(insertMeasures(song, selRange[1] + 1, clipboard.length ? clipboard : [{ chords: [{ symbol: 'N.C.', beats: bpm }] }]), `Inserted after ${selRange[1]}`);
  }
  function del() {
    if (!selRange) return;
    onChange(deleteMeasures(song, selRange[0], selRange[1]), `Deleted measures ${selRange[0]}–${selRange[1]}`);
    setSelection(null);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (!selection) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'c') { e.preventDefault(); copy(); }
      else if (mod && e.key === 'v') { e.preventDefault(); paste(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); }
      else if (e.key === 'Enter') { e.preventDefault(); setEditing(selection.focus); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = Math.max(1, Math.min(flat.length, selection.focus + (e.key === 'ArrowRight' ? 1 : -1)));
        setSelection(e.shiftKey ? { ...selection, focus: next } : { anchor: next, focus: next });
      } else if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  let counter = 0;
  return (
    <div ref={gridRef} className="space-y-6" onClick={(e) => { if (e.target === gridRef.current) setSelection(null); }}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <span className="mr-2">
          {selRange ? `Selected mm. ${selRange[0]}${selRange[1] !== selRange[0] ? `–${selRange[1]}` : ''}` : 'Click a measure to select. Shift+click to extend. Double-click or Enter to edit.'}
        </span>
        <button className="btn" disabled={!selRange} onClick={copy}>Copy</button>
        <button className="btn" disabled={!selRange || !clipboard.length} onClick={paste}>Paste</button>
        <button className="btn" disabled={!selRange} onClick={insertAfter}>Insert after</button>
        <button className="btn" disabled={!selRange} onClick={del}>Delete</button>
        {clipboard.length > 0 && <span className="text-zinc-500">clipboard: {clipboard.length} bar(s)</span>}
        <label className="ml-auto flex items-center gap-1 text-zinc-500" title="Bars per row (Auto follows the meter)">
          Row
          <select className="field !py-0.5 text-xs" value={barsPerRow} onChange={(e) => { const v = Number(e.target.value); setBarsPerRow(v); try { localStorage.setItem('songbrain.barsPerRow', String(v)); } catch { /* ignore */ } }}>
            <option value={0}>Auto ({autoBars})</option>
            {[2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-zinc-500" title="Show Roman numerals and harmonic function under each chord">
          <input type="checkbox" className="accent-amber-400" checked={showAnalysis} onChange={(e) => { setShowAnalysis(e.target.checked); try { localStorage.setItem('songbrain.analysis', e.target.checked ? '1' : '0'); } catch { /* ignore */ } }} /> Analysis
        </label>
      </div>
      {analysis && analysis.patterns.length > 0 && (
        <div className="text-[11px] text-zinc-400 rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 space-y-0.5">
          {analysis.patterns.slice(0, 8).map((p, i) => <div key={i}>• {p}</div>)}
          {analysis.patterns.length > 8 && <div className="text-zinc-500">…and {analysis.patterns.length - 8} more</div>}
        </div>
      )}

      {song.sections.map((section, si) => {
        const start = counter + 1;
        counter += section.measures.length;
        return (
          <section key={si} className="rounded-lg border border-zinc-800 bg-zinc-900/40">
            <header className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800">
              <input
                className="field w-16 font-semibold text-amber-300"
                value={section.name}
                onChange={(e) => onChange(renameSection(song, si, e.target.value), `Renamed section`)}
              />
              <span className="text-xs text-zinc-500">{section.measures.length} bars · mm. {start}–{start + section.measures.length - 1}</span>
              <label className="text-xs text-zinc-500 flex items-center gap-1 ml-2" title="Playing style for this section">
                Style
                <select
                  className="field !py-0.5 text-xs"
                  value={song.arrangement?.sections?.[String(si)] ?? ''}
                  onChange={(e) => {
                    const sections = { ...(song.arrangement?.sections ?? {}) };
                    if (e.target.value) sections[String(si)] = e.target.value; else delete sections[String(si)];
                    onChange({ ...song, arrangement: { ...(song.arrangement ?? { defaultStyle: 'swing' }), sections } }, `Set ${section.name} style`);
                  }}
                >
                  <option value="">Song default ({availableStyles(song).find((x) => x.id === styleIdForSection({ ...song, arrangement: { ...(song.arrangement ?? { defaultStyle: 'swing' }), sections: {} } }, si))?.name})</option>
                  {availableStyles(song).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                {(['a', 'b'] as const).map((sub) => {
                  const hasB = !!styleForSection(song, si).substyles.b;
                  const active = substyleIdForSection(song, si) === sub;
                  return (
                    <button
                      key={sub}
                      className={`btn !px-2 !py-0.5 uppercase ${active ? '!bg-amber-500 !text-zinc-950 !border-amber-400' : ''}`}
                      disabled={sub === 'b' && !hasB}
                      title={sub === 'a' ? 'Substyle A (verse)' : hasB ? 'Substyle B (chorus, busier)' : 'This style has no B substyle'}
                      onClick={() => {
                        const substyles = { ...(song.arrangement?.substyles ?? {}) };
                        if (sub === 'a') delete substyles[String(si)]; else substyles[String(si)] = 'b';
                        onChange({ ...song, arrangement: { ...(song.arrangement ?? { defaultStyle: 'swing' }), substyles } }, `Set ${section.name} substyle ${sub.toUpperCase()}`);
                      }}
                    >{sub}</button>
                  );
                })}
              </label>
              <div className="ml-auto flex gap-1">
                <button className="btn" onClick={() => onChange(appendMeasure(song, si), `Added measure to ${section.name}`)}>+ Bar</button>
                <button className="btn" onClick={() => onChange(removeSection(song, si), `Removed section ${section.name}`)} disabled={song.sections.length === 1}>Remove</button>
              </div>
            </header>
            <div className="grid gap-px bg-zinc-800 p-px rounded-b-lg" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {section.measures.map((m, mi) => {
                const n = start + mi;
                const active = position.measure === n ? position.state : null;
                const selected = isSelected(n);
                return (
                  <MeasureCell
                    key={mi}
                    number={n}
                    measure={m}
                    bpm={bpm}
                    active={active}
                    selected={selected}
                    editing={editing === n}
                    onSelect={(extend) => { setSelection(extend && selection ? { ...selection, focus: n } : { anchor: n, focus: n }); if (!extend) onSeek(n); }}
                    onEdit={() => setEditing(n)}
                    onPlay={() => onPlayFrom(n)}
                    onCommit={(text) => {
                      setEditing(null);
                      const parsed = parseMeasureText(text, bpm);
                      if (JSON.stringify(parsed) !== JSON.stringify(m)) onChange(setMeasure(song, { sectionIndex: si, measureIndex: mi }, parsed), `Edited measure ${n}`);
                    }}
                    onCancel={() => setEditing(null)}
                    analysis={analysis ? m.chords.map((_, ci) => romanFor(n, ci)) : null}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      <button className="btn" onClick={() => onChange(addSection(song), 'Added section')}>+ Add section</button>
    </div>
  );
}

interface CellProps {
  number: number;
  measure: Measure;
  bpm: number;
  active: 'playing' | 'paused' | 'stopped' | null;
  selected: boolean;
  editing: boolean;
  onSelect: (extend: boolean) => void;
  onEdit: () => void;
  onPlay: () => void;
  onCommit: (text: string) => void;
  onCancel: () => void;
  analysis?: Array<{ roman: string; function: string; diatonic: boolean } | null> | null;
}

const FUNCTION_COLOR: Record<string, string> = { tonic: 'text-emerald-300', subdominant: 'text-sky-300', dominant: 'text-amber-300', 'secondary dominant': 'text-orange-300', 'tritone sub': 'text-fuchsia-300', chromatic: 'text-rose-300', 'n.c.': 'text-zinc-500' };

function MeasureCell({ number, measure, bpm, active, selected, editing, onSelect, onEdit, onPlay, onCommit, onCancel, analysis }: CellProps) {
  const [text, setText] = useState(() => measureToText(measure, bpm));
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!editing) setText(measureToText(measure, bpm)); }, [measure, bpm, editing]);
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);

  return (
    <div
      className={`chord-cell relative min-h-[4.5rem] p-2 cursor-pointer select-none transition-colors
        ${active === 'playing' ? 'bg-amber-500/25' : active === 'paused' ? 'bg-sky-500/20' : selected ? 'bg-zinc-700/60' : 'bg-zinc-950 hover:bg-zinc-900'} ${active ? 'ring-1 ring-inset ring-amber-400/60' : ''}`}
      onClick={(e) => onSelect(e.shiftKey)}
      onDoubleClick={onEdit}
    >
      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        <span>{number}</span>
        <button className="opacity-0 hover:opacity-100 group-hover:opacity-100 text-zinc-400 hover:text-amber-300" title="Play from here" onClick={(e) => { e.stopPropagation(); onPlay(); }}>▶</button>
      </div>
      {editing ? (
        <input
          ref={inputRef}
          className="field w-full mt-1 font-mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => onCommit(text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit(text);
            if (e.key === 'Escape') onCancel();
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="mt-1 flex items-baseline gap-2 flex-wrap">
          {measure.chords.map((c, i) => (
            <span key={i} className={`font-semibold ${measure.chords.length > 1 ? 'text-base' : 'text-xl'} ${c.symbol === 'N.C.' ? 'text-zinc-600' : 'text-zinc-100'}`}>
              {c.symbol}
              {measure.chords.length > 1 && Math.abs(c.beats - bpm / measure.chords.length) > 1e-6 && (
                <sub className="text-[10px] text-zinc-500 ml-0.5">{c.beats}</sub>
              )}
            </span>
          ))}
        </div>
      )}
      {!editing && analysis && (
        <div className="mt-1 flex gap-2 flex-wrap text-[10px] leading-tight">
          {analysis.map((a, i) => a && (
            <span key={i} className={`${FUNCTION_COLOR[a.function] ?? FUNCTION_COLOR[a.function.startsWith('V of') || a.function.startsWith('ii of') ? 'secondary dominant' : 'chromatic']} ${a.diatonic ? '' : 'italic'}`} title={a.function}>
              {a.roman}<span className="text-zinc-600"> · {a.function}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

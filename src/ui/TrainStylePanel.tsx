import { useEffect, useRef, useState } from 'react';
import type { Song } from '../model/song';
import { flattenMeasures } from '../model/song';
import type { Style } from '../model/style';
import { PRESET_STYLES } from '../engine/style/presets';
import { Modal } from './Modal';

interface Report { startBar: number; chartBars: number; endingBars: number; swing: number; pushPullTicks: number; humanizeTicks: number; roles: Array<{ track: string; role: string; notes: number }> }

interface Props {
  song: Song;
  onClose: () => void;
  /** Called with the learned style; the app embeds it in the song and makes it the default. */
  onTrained: (style: Style, label: string) => void;
  onOpenHelp: () => void;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function toBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function TrainStylePanel({ song, onClose, onTrained, onOpenHelp }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [substyle, setSubstyle] = useState<'a' | 'b'>('a');
  const [name, setName] = useState('');
  const [existing, setExisting] = useState('');
  const [library, setLibrary] = useState<Style[]>([]);
  const [patternBars, setPatternBars] = useState<1 | 2>(1);
  const [startBar, setStartBar] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ style: Style; report: Report } | null>(null);
  const bars = flattenMeasures(song).length;

  useEffect(() => {
    fetch('/api/styles').then((r) => r.json()).then((l: Style[]) => {
      const custom = l.filter((s) => !(s.id in PRESET_STYLES));
      setLibrary(custom);
      setExisting((e) => e || custom[0]?.id || '');
    }).catch(() => {});
  }, []);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f); setResult(null); setError(null);
    if (!name) setName(f.name.replace(/\.midi?$/i, '').replace(/[-_ ]?[ab]$/i, ''));
  };
  const target = substyle === 'b' ? library.find((s) => s.id === existing) : null;
  const canTrain = !!file && !busy && (substyle === 'b' ? !!target : !!slug(name));

  const train = async () => {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const id = target ? target.id : slug(name);
      const res = await fetch('/api/styles/learn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          midiBase64: await toBase64(file), chart: flattenMeasures(song).map((m) => m.measure), id, name: target ? target.name : name.trim(),
          substyle, patternBars, startBar: startBar.trim() === '' ? undefined : Math.max(0, Number(startBar) - 1), save: true, source: file.name,
        }),
      });
      const data = await res.json();
      if (!data.ok) { setError(`${data.error}${data.errors ? ': ' + data.errors.slice(0, 3).join('; ') : ''}`); return; }
      setResult({ style: data.style, report: data.report });
      onTrained(data.style, `Trained style ${data.style.name} (${substyle.toUpperCase()})`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Train a style from MIDI" onClose={onClose}>
      <div className="p-4 flex flex-col gap-3 text-xs text-zinc-300">
        <p className="text-zinc-400">
          Drop a MIDI file of the <strong className="text-zinc-200">current chart</strong> ({song.title}, {bars} bars) from any MIDI application: a DAW, an automatic accompaniment program or a MIDI accompaniment generator. Count-in and ending are detected.{' '}
          <button className="underline text-purple-300" onClick={() => { onClose(); onOpenHelp(); }}>How it works</button>
        </p>

        <div
          className={`rounded-md border-2 border-dashed px-4 py-6 text-center cursor-pointer ${drag ? 'border-purple-400 bg-purple-400/10' : 'border-zinc-700 hover:border-zinc-500'}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        >
          {file ? <span className="text-zinc-100">{file.name}</span> : <span className="text-zinc-500">Drop a .mid file here, or click to choose</span>}
          <input ref={fileRef} type="file" accept=".mid,.midi,audio/midi" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Learn as</span>
          <div className="flex rounded-md border border-zinc-700 overflow-hidden">
            {(['a', 'b'] as const).map((s) => (
              <button key={s} className={`px-3 py-1 ${substyle === s ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'}`} onClick={() => setSubstyle(s)}>
                {s === 'a' ? 'New style (A)' : 'Add substyle B'}
              </button>
            ))}
          </div>
        </div>

        {substyle === 'a' ? (
          <label className="flex items-center gap-2">Name
            <input className="field flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acoustic Rock" />
            {name && <span className="text-zinc-500">id: {slug(name)}</span>}
          </label>
        ) : library.length ? (
          <label className="flex items-center gap-2">Add to
            <select className="field flex-1" value={existing} onChange={(e) => setExisting(e.target.value)}>
              {library.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        ) : <p className="text-purple-300">No trained styles yet. Train substyle A first.</p>}

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">Pattern length
            <select className="field" value={patternBars} onChange={(e) => setPatternBars(Number(e.target.value) as 1 | 2)}>
              <option value={1}>1 bar</option><option value={2}>2 bars</option>
            </select>
          </label>
          <label className="flex items-center gap-2" title="Leave empty to detect from the leading silence">Chart starts at bar
            <input className="field w-16" type="number" min={1} value={startBar} onChange={(e) => setStartBar(e.target.value)} placeholder="auto" />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn btn-primary" disabled={!canTrain} onClick={() => void train()}>{busy ? 'Training…' : 'Train'}</button>
          <button className="btn" onClick={onClose}>{result ? 'Done' : 'Cancel'}</button>
        </div>

        {error && <p className="text-rose-300 break-words">{error}</p>}
        {result && (
          <div className="rounded-md border border-emerald-700/50 bg-emerald-900/10 p-3 space-y-1">
            <p className="text-emerald-300 font-semibold">Trained “{result.style.name}” ({substyle.toUpperCase()}) and set it as the default style. Saved to styles/{result.style.id}.json</p>
            <p>Chart from bar {result.report.startBar + 1}, {result.report.chartBars} bars, {result.report.endingBars}-bar ending. Swing {result.report.swing}, push {result.report.pushPullTicks} ticks, humanize {result.report.humanizeTicks} ticks.</p>
            <ul className="list-disc pl-5 text-zinc-400">
              {result.report.roles.map((r, i) => <li key={i}>{r.track}: {r.role === 'ignored' ? 'ignored' : r.role} ({r.notes} notes)</li>)}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

import { useMemo, useState } from 'react';
import type { Song } from '../model/song';
import type { Style } from '../model/style';
import { pma5SongToChart, pma5StyleToMidi, readPma5Bank } from '../engine/import/pma5';
import { styleFromMidi } from '../engine/style/learn';
import { Modal } from './Modal';

interface Props {
  bytes: Uint8Array;
  fileName: string;
  onClose: () => void;
  onLoadSong: (song: Song, label: string) => void;
  onImportStyles: (styles: Style[], label: string) => void;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function Pma5ImportPanel({ bytes, fileName, onClose, onLoadSong, onImportStyles }: Props) {
  const parsed = useMemo(() => {
    try { return { bank: readPma5Bank(bytes), error: null as string | null }; }
    catch (e) { return { bank: null, error: (e as Error).message }; }
  }, [bytes]);
  const bank = parsed.bank;
  const [picked, setPicked] = useState<Set<number>>(() => new Set(bank?.styles.map((s) => s.slot) ?? []));
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggle = (slot: number) => setPicked((p) => { const n = new Set(p); if (n.has(slot)) n.delete(slot); else n.add(slot); return n; });

  const importStyles = async () => {
    if (!bank) return;
    setBusy(true); setNotes([]);
    const out: Style[] = [], msgs: string[] = [], used = new Set<string>();
    for (const st of bank.styles.filter((s) => picked.has(s.slot))) {
      try {
        const conv = pma5StyleToMidi(st);
        let id = `pma5-${slug(st.name) || `u${st.slot}`}`;
        while (used.has(id)) id += '-2';
        used.add(id);
        const chart = Array.from({ length: conv.bars }, () => ({ chords: [{ symbol: 'C', beats: conv.beatsPerBar }] }));
        const { style } = styleFromMidi(conv.midi, {
          id, name: st.name, chart, startBar: 0, patternBars: conv.bars === 1 ? 1 : conv.bars % 2 === 0 ? 2 : 1,
          beatsPerBar: conv.beatsPerBar, source: `PMA-5 user style U${String(st.slot).padStart(3, '0')} (${fileName})`,
        });
        const res = await fetch('/api/styles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(style) });
        const data = await res.json();
        if (!data.ok) { msgs.push(`${st.name}: ${data.errors?.slice(0, 2).join('; ') ?? 'could not be saved'}`); continue; }
        out.push(style);
        conv.warnings.forEach((w) => msgs.push(`${st.name}: ${w}`));
      } catch (e) { msgs.push(`${st.name}: ${(e as Error).message}`); }
    }
    setBusy(false);
    setNotes(msgs);
    if (out.length) { onImportStyles(out, `Imported ${out.length} PMA-5 style(s)`); if (!msgs.length) onClose(); }
  };

  return (
    <Modal title="Import from PMA-5 backup" onClose={onClose} wide>
      <div className="p-4 text-xs text-zinc-300 space-y-4">
        {parsed.error && <p className="text-rose-300">{parsed.error}</p>}
        {bank && (
          <>
            <p className="text-zinc-400">{fileName}: {bank.songs.length} song(s), {bank.styles.length} user style(s). Read from the file format notes; if something looks wrong, please report it with the file.</p>
            {bank.warnings.map((w, i) => <p key={i} className="text-purple-300">{w}</p>)}

            <section>
              <h3 className="font-semibold text-zinc-100 mb-1">Songs</h3>
              {bank.songs.length === 0 ? <p className="text-zinc-500">No songs in this backup.</p> : (
                <ul className="space-y-1">
                  {bank.songs.map((s) => {
                    const chart = pma5SongToChart(s);
                    const bars = chart.song.sections[0].measures.length;
                    return (
                      <li key={s.slot} className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                        <span className="text-zinc-500 w-8">S{String(s.slot).padStart(2, '0')}</span>
                        <span className="flex-1 min-w-0 truncate text-zinc-100">{s.name} <span className="text-zinc-500">· {chart.song.meter} · {s.tempo} bpm · {bars} bars</span></span>
                        <button className="btn" title={chart.warnings.join('\n')} onClick={() => { onLoadSong(chart.song, `Imported PMA-5 song ${s.name}`); onClose(); }}>Load chart</button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-zinc-500 mt-1">Loads the chord chart (chords, meter, tempo). The song's own note tracks and style changes are not imported. Loading replaces the current song; Ctrl+Z undoes it.</p>
            </section>

            <section>
              <h3 className="font-semibold text-zinc-100 mb-1">User styles</h3>
              {bank.styles.length === 0 ? <p className="text-zinc-500">No user styles in this backup.</p> : (
                <>
                  <ul className="space-y-1">
                    {bank.styles.map((s) => (
                      <li key={s.slot}>
                        <label className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2 cursor-pointer">
                          <input type="checkbox" className="accent-purple-400" checked={picked.has(s.slot)} onChange={() => toggle(s.slot)} />
                          <span className="text-zinc-500 w-10">U{String(s.slot).padStart(3, '0')}</span>
                          <span className="flex-1 min-w-0 truncate text-zinc-100">{s.name} <span className="text-zinc-500">· {s.bars} bar(s) · {s.tempo} bpm</span></span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2 mt-2">
                    <button className="btn btn-primary" disabled={busy || !picked.size} onClick={() => void importStyles()}>{busy ? 'Importing…' : `Import ${picked.size} style(s)`}</button>
                    <span className="text-zinc-500">Saved to the style library and added to this song.</span>
                  </div>
                </>
              )}
              {notes.map((n, i) => <p key={i} className="text-purple-300 mt-1">{n}</p>)}
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}

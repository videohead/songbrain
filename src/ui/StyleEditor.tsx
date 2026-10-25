/**
 * Lane-view style editor. Patterns are blocks on beat lanes you drag, resize
 * and re-voice; feel is knobs. Everything edits the same style JSON the agent
 * edits. Presets are read-only: "Duplicate to edit" copies one into the song.
 */
import { useMemo, useState } from 'react';
import type { Song } from '../model/song';
import { cloneSong } from '../model/song';
import type { BassHit, CompHit, DrumHit, Pattern, RolePatterns, Style, SubstyleId } from '../model/style';
import { GM_DRUM_NAMES } from '../model/style';
import { PRESET_STYLES } from '../engine/style/presets';
import { availableStyles, styleIdForSection, substyleIdForSection } from '../engine/style/resolve';
import { VOICING_STYLES, BASS_STYLES } from '../engine/voicing';
import { Knob } from './Knob';

interface Props {
  song: Song;
  cursorSection: number;
  onChange: (song: Song, label: string, coalesce?: boolean) => void;
  onAudition: (sectionIndex: number) => void;
  onStop: () => void;
  playing: boolean;
  onClose: () => void;
}

type Role = 'comp' | 'bass' | 'drums';
type AnyHit = CompHit | BassHit | DrumHit;
const CELL = 18; // px per 16th
const VOICES: CompHit['voice'][] = ['full', 'top', 'bottom', 'arpUp', 'arpDown'];
const VOICE_LABEL: Record<CompHit['voice'], string> = { full: 'F', top: 'T', bottom: 'B', arpUp: '↑', arpDown: '↓' };
const DEGREES: BassHit['degree'][] = ['root', 'third', 'fifth', 'octave', 'approach'];
const DEGREE_LABEL: Record<BassHit['degree'], string> = { root: 'R', third: '3', fifth: '5', octave: '8', approach: 'A' };
const DRUM_CHOICES = [36, 38, 37, 42, 44, 46, 51, 53, 49, 45, 47, 50, 54, 56, 70, 39];

export function StyleEditor({ song, cursorSection, onChange, onAudition, onStop, playing, onClose }: Props) {
  const styles = useMemo(() => availableStyles(song), [song]);
  const [styleId, setStyleId] = useState(() => styleIdForSection(song, cursorSection));
  const [sub, setSub] = useState<SubstyleId>(() => substyleIdForSection(song, cursorSection));
  const [varIdx, setVarIdx] = useState<Record<Role, { kind: 'variations' | 'fills'; i: number }>>({ comp: { kind: 'variations', i: 0 }, bass: { kind: 'variations', i: 0 }, drums: { kind: 'variations', i: 0 } });
  const [status, setStatus] = useState<string | null>(null);

  const style = styles.find((s) => s.id === styleId) ?? styles[0];
  const isPreset = !!PRESET_STYLES[style.id] && !song.styles?.[style.id];
  const substyle = (sub === 'b' && style.substyles.b) ? style.substyles.b : style.substyles.a;
  const totalBeats = style.bars * style.beatsPerBar;
  const cols = totalBeats * 4;

  /** Apply a mutation to the editable copy of the style (duplicating a preset first). */
  const edit = (label: string, fn: (s: Style) => void, coalesce = false) => {
    if (isPreset) { setStatus('Preset styles are read-only. Duplicate to edit.'); return; }
    const next = cloneSong(song);
    const copy: Style = JSON.parse(JSON.stringify(style));
    fn(copy);
    next.styles = { ...(next.styles ?? {}), [copy.id]: copy };
    onChange(next, label, coalesce);
  };
  const duplicate = () => {
    const base = style.id.replace(/-custom(-\d+)?$/, '');
    let id = `${base}-custom`, n = 1;
    while (song.styles?.[id] || PRESET_STYLES[id]) id = `${base}-custom-${++n}`;
    const copy: Style = { ...JSON.parse(JSON.stringify(style)), id, name: `${style.name} (edited)`, source: `copy of ${style.id}` };
    const next = cloneSong(song);
    next.styles = { ...(next.styles ?? {}), [id]: copy };
    const arr = next.arrangement ?? { defaultStyle: 'swing' };
    arr.sections = { ...(arr.sections ?? {}), [String(cursorSection)]: id };
    next.arrangement = arr;
    onChange(next, `Duplicated style ${style.name}`);
    setStyleId(id);
    setStatus(`Created "${copy.name}" and assigned it to section ${song.sections[cursorSection]?.name ?? cursorSection}.`);
  };
  const saveToLibrary = async () => {
    const res = await fetch('/api/styles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(style) });
    const d = await res.json();
    setStatus(d.ok ? `Saved "${style.name}" to the server library.` : `Save failed: ${(d.errors ?? [d.error]).join('; ')}`);
  };

  const rolePatterns = (s: Style, role: Role): RolePatterns<AnyHit> | undefined => {
    const ss = (sub === 'b' && s.substyles.b) ? s.substyles.b : s.substyles.a;
    return ss[role] as RolePatterns<AnyHit> | undefined;
  };
  const ensureRole = (s: Style, role: Role): RolePatterns<AnyHit> => {
    const ss = (sub === 'b' && s.substyles.b) ? s.substyles.b! : s.substyles.a;
    if (!ss[role]) {
      if (role === 'bass') ss.bass = { style: 'roots-fifths', variations: [{ hits: [] }] };
      else if (role === 'comp') ss.comp = { variations: [{ hits: [] }] };
      else ss.drums = { variations: [{ hits: [] }] };
    }
    return ss[role] as RolePatterns<AnyHit>;
  };
  const currentPattern = (role: Role): Pattern<AnyHit> | undefined => {
    const rp = rolePatterns(style, role);
    const sel = varIdx[role];
    return rp?.[sel.kind]?.[sel.i];
  };
  const editPattern = (role: Role, label: string, fn: (p: Pattern<AnyHit>) => void, coalesce = false) =>
    edit(label, (s) => { const rp = ensureRole(s, role); const sel = varIdx[role]; const list = sel.kind === 'fills' ? (rp.fills ??= []) : rp.variations; if (!list[sel.i]) list[sel.i] = { hits: [] }; fn(list[sel.i]); }, coalesce);

  const knob127 = (v: number, lo: number, hi: number) => Math.round(((v - lo) / (hi - lo)) * 127);
  const from127 = (k: number, lo: number, hi: number) => lo + (k / 127) * (hi - lo);

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/60 text-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-zinc-800/60 text-xs">
        <span className="font-semibold text-sm">Style editor</span>
        <select className="field" value={style.id} onChange={(e) => { setStyleId(e.target.value); setSub('a'); }}>
          {styles.map((s) => <option key={s.id} value={s.id}>{s.name}{PRESET_STYLES[s.id] && !song.styles?.[s.id] ? ' (preset)' : ''}</option>)}
        </select>
        {(['a', 'b'] as const).map((k) => (
          <button key={k} className={`btn uppercase !px-2 ${sub === k ? '!bg-amber-500 !text-zinc-950 !border-amber-400' : ''}`} onClick={() => setSub(k)} disabled={k === 'b' && !style.substyles.b && isPreset}>{k}</button>
        ))}
        {sub === 'b' && !style.substyles.b && !isPreset && <button className="btn" onClick={() => edit('Added substyle B', (s) => { s.substyles.b = JSON.parse(JSON.stringify(s.substyles.a)); })}>Create B from A</button>}
        <input className="field w-40" value={style.name} disabled={isPreset} onChange={(e) => edit('Renamed style', (s) => { s.name = e.target.value; }, true)} />
        <label className="flex items-center gap-1 text-zinc-400">bars
          <select className="field" value={style.bars} disabled={isPreset} onChange={(e) => edit('Pattern length', (s) => { s.bars = Number(e.target.value); })}>{[1, 2, 4].map((b) => <option key={b}>{b}</option>)}</select>
        </label>
        {isPreset ? <button className="btn btn-primary" onClick={duplicate}>Duplicate to edit</button> : <button className="btn" onClick={saveToLibrary}>Save to library</button>}
        <button className="btn" onClick={() => onChange({ ...song, arrangement: { ...(song.arrangement ?? { defaultStyle: 'swing' }), sections: { ...(song.arrangement?.sections ?? {}), [String(cursorSection)]: style.id } } }, `Assigned ${style.name} to section`)} title="Assign this style to the section at the cursor">Assign to section {song.sections[cursorSection]?.name}</button>
        <button className={`btn ${playing ? '!bg-rose-600 !border-rose-500 !text-white' : 'btn-primary'}`} onClick={() => (playing ? onStop() : onAudition(cursorSection))}>{playing ? '■ Stop' : '▶ Loop section'}</button>
        <div className="ml-auto flex items-center gap-2">
          {status && <span className="text-emerald-300 truncate max-w-md" title={status}>{status}</span>}
          <button className="btn" onClick={onClose} title="Collapse">▲ Collapse</button>
        </div>
      </div>

      <div className="flex gap-4 px-4 py-3 overflow-x-auto">
        {/* Feel knobs */}
        <div className="shrink-0 flex flex-col gap-2 pr-4 border-r border-zinc-800">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Feel</div>
          <div className="flex gap-2">
            <Knob label="Swing" value={knob127(style.feel.swing, 0, 1)} defaultValue={0} onChange={(k) => edit('Swing', (s) => { s.feel.swing = Math.round(from127(k, 0, 1) * 100) / 100; }, true)} />
            <Knob label="Push/Pull" value={knob127(style.feel.pushPull, -32, 32)} bipolar onChange={(k) => edit('Push-pull', (s) => { s.feel.pushPull = Math.round(from127(k, -32, 32)); }, true)} />
            <Knob label="Humanize" value={knob127(style.feel.humanize, 0, 24)} defaultValue={0} onChange={(k) => edit('Humanize', (s) => { s.feel.humanize = Math.round(from127(k, 0, 24)); }, true)} />
          </div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500 mt-1">Accents</div>
          <div className="flex gap-1">
            {Array.from({ length: style.beatsPerBar }, (_, i) => (
              <Knob key={i} size={32} label={`${i + 1}`} value={knob127(style.feel.accents[i] ?? 1, 0, 1.25)} defaultValue={knob127(1, 0, 1.25)} onChange={(k) => edit('Accents', (s) => { const a = [...s.feel.accents]; while (a.length < s.beatsPerBar) a.push(1); a[i] = Math.round(from127(k, 0, 1.25) * 100) / 100; s.feel.accents = a; }, true)} />
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500 mt-1">Role push/pull</div>
          <div className="flex gap-1">
            {(['chords', 'bass', 'drums'] as const).map((r) => (
              <Knob key={r} size={32} label={r} bipolar value={knob127(style.feel.rolePushPull?.[r] ?? 0, -16, 16)} onChange={(k) => edit('Role push-pull', (s) => { s.feel.rolePushPull = { ...(s.feel.rolePushPull ?? {}), [r]: Math.round(from127(k, -16, 16)) }; }, true)} />
            ))}
          </div>
        </div>

        {/* Lanes */}
        <div className="flex flex-col gap-3 min-w-0">
          {(['comp', 'bass', 'drums'] as Role[]).map((role) => {
            const rp = rolePatterns(style, role);
            const sel = varIdx[role];
            const pattern = currentPattern(role);
            return (
              <div key={role} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
                <div className="flex flex-wrap items-center gap-1 text-[11px] mb-2">
                  <span className="font-semibold w-12 capitalize">{role}</span>
                  {rp?.variations.map((v, i) => (
                    <button key={`v${i}`} className={`btn !py-0 ${sel.kind === 'variations' && sel.i === i ? '!bg-zinc-600' : ''}`} onClick={() => setVarIdx({ ...varIdx, [role]: { kind: 'variations', i } })} title={`weight ${v.weight ?? 1}`}>Var {i + 1} <span className="text-zinc-500">×{v.weight ?? 1}</span></button>
                  ))}
                  {!isPreset && <button className="btn !py-0" title="Add variation (copy of current)" onClick={() => edit('Added variation', (s) => { const r = ensureRole(s, role); r.variations.push(JSON.parse(JSON.stringify(pattern ?? { hits: [] }))); })}>+ var</button>}
                  {rp?.fills?.map((_, i) => (
                    <button key={`f${i}`} className={`btn !py-0 ${sel.kind === 'fills' && sel.i === i ? '!bg-zinc-600' : ''}`} onClick={() => setVarIdx({ ...varIdx, [role]: { kind: 'fills', i } })}>Fill {i + 1}</button>
                  ))}
                  {!isPreset && <button className="btn !py-0" title="Add fill (copy of current)" onClick={() => { edit('Added fill', (s) => { const r = ensureRole(s, role); (r.fills ??= []).push(JSON.parse(JSON.stringify(pattern ?? { hits: [] }))); }); setVarIdx({ ...varIdx, [role]: { kind: 'fills', i: rp?.fills?.length ?? 0 } }); }}>+ fill</button>}
                  {pattern && !isPreset && sel.kind === 'variations' && (
                    <label className="ml-2 text-zinc-500 flex items-center gap-1">weight <input type="number" min={0} max={20} className="field !py-0 w-12" value={pattern.weight ?? 1} onChange={(e) => editPattern(role, 'Variation weight', (p) => { p.weight = Number(e.target.value); })} /></label>
                  )}
                  {pattern && !isPreset && (rp?.variations.length ?? 0) + (rp?.fills?.length ?? 0) > 1 && (
                    <button className="btn !py-0 text-rose-300" onClick={() => { edit('Removed pattern', (s) => { const r = ensureRole(s, role); const list = sel.kind === 'fills' ? r.fills! : r.variations; list.splice(sel.i, 1); if (!r.variations.length) r.variations.push({ hits: [] }); }); setVarIdx({ ...varIdx, [role]: { kind: 'variations', i: 0 } }); }}>remove</button>
                  )}
                  {role === 'comp' && (
                    <select className="field !py-0 text-[10px] ml-auto" value={substyle.comp?.voicing ?? ''} disabled={isPreset} onChange={(e) => edit('Comp voicing', (s) => { const r = ensureRole(s, 'comp') as RolePatterns<CompHit> & { voicing?: CompHit['voice'] }; (r as { voicing?: string }).voicing = e.target.value || undefined; })} title="Voicing style for comp (blank = track default)">
                      <option value="">track voicing</option>
                      {VOICING_STYLES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  )}
                  {role === 'bass' && (
                    <select className="field !py-0 text-[10px] ml-auto" value={substyle.bass?.style ?? 'roots-fifths'} disabled={isPreset} onChange={(e) => edit('Bass style', (s) => { (ensureRole(s, 'bass') as RolePatterns<BassHit> & { style: string }).style = e.target.value; })} title="Fallback bass style when this pattern has no hits">
                      {BASS_STYLES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  )}
                </div>
                <Lane role={role} pattern={pattern} cols={cols} beatsPerBar={style.beatsPerBar} swing={style.feel.swing} readOnly={isPreset}
                  onEdit={(label, fn, coalesce) => editPattern(role, label, fn, coalesce)} />
              </div>
            );
          })}
          <div className="text-[10px] text-zinc-500">Click an empty cell to add a hit · drag to move · drag the right edge for length · wheel for velocity · right-click to change voice/degree · Shift+click toggles push (anticipate next chord) · double-click deletes.</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface LaneProps {
  role: Role;
  pattern: Pattern<AnyHit> | undefined;
  cols: number;
  beatsPerBar: number;
  swing: number;
  readOnly: boolean;
  onEdit: (label: string, fn: (p: Pattern<AnyHit>) => void, coalesce?: boolean) => void;
}

function Lane({ role, pattern, cols, beatsPerBar, swing, readOnly, onEdit }: LaneProps) {
  const hits = pattern?.hits ?? [];
  const width = cols * CELL;
  const rows: Array<{ key: number | null; label: string }> = role === 'drums'
    ? [...new Set((hits as DrumHit[]).map((h) => h.drum))].sort((a, b) => b - a).map((d) => ({ key: d, label: GM_DRUM_NAMES[d] ?? `#${d}` }))
    : [{ key: null, label: '' }];
  const [addDrum, setAddDrum] = useState(DRUM_CHOICES[0]);

  const beatOf = (clientX: number, el: HTMLElement) => Math.max(0, Math.min(cols - 1, Math.floor((clientX - el.getBoundingClientRect().left) / CELL))) / 4;

  const rowHits = (rowKey: number | null) => hits.map((h, i) => ({ h, i })).filter(({ h }) => rowKey === null || (h as DrumHit).drum === rowKey);

  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={String(row.key)} className="flex items-center gap-2">
          {role === 'drums' && <span className="w-20 shrink-0 text-[10px] text-zinc-400 truncate" title={row.label}>{row.label}</span>}
          <div
            className="relative h-8 rounded bg-zinc-900 border border-zinc-800 overflow-hidden"
            style={{ width, backgroundImage: `repeating-linear-gradient(to right, transparent 0 ${CELL * 4 - 1}px, #52525b ${CELL * 4 - 1}px ${CELL * 4}px), repeating-linear-gradient(to right, transparent 0 ${CELL - 1}px, #27272a ${CELL - 1}px ${CELL}px)` }}
            onClick={(e) => {
              if (readOnly || (e.target as HTMLElement).dataset.hit) return;
              const beat = beatOf(e.clientX, e.currentTarget);
              onEdit('Added hit', (p) => {
                if (role === 'drums') p.hits.push({ beat, duration: 0.25, velocity: 90, drum: row.key ?? addDrum } as DrumHit);
                else if (role === 'bass') p.hits.push({ beat, duration: 0.5, velocity: 90, degree: 'root' } as BassHit);
                else p.hits.push({ beat, duration: 0.5, velocity: 80, voice: 'full' } as CompHit);
              });
            }}
          >
            {/* Bar lines and swung-8th markers */}
            {Array.from({ length: cols / 4 / beatsPerBar + 1 }, (_, b) => <div key={b} className="absolute top-0 bottom-0 w-px bg-zinc-500" style={{ left: b * beatsPerBar * 4 * CELL }} />)}
            {swing > 0 && Array.from({ length: cols / 4 }, (_, b) => <div key={`s${b}`} className="absolute top-0 bottom-0 w-px bg-amber-500/40" style={{ left: (b + 0.5 + swing / 6) * 4 * CELL }} title="where swung 8ths land" />)}
            {rowHits(row.key).map(({ h, i }) => (
              <HitBlock key={i} role={role} hit={h} readOnly={readOnly} cols={cols}
                onMove={(beat, coalesce) => onEdit('Moved hit', (p) => { p.hits[i].beat = beat; }, coalesce)}
                onResize={(dur, coalesce) => onEdit('Hit length', (p) => { p.hits[i].duration = dur; }, coalesce)}
                onVelocity={(v) => onEdit('Hit velocity', (p) => { p.hits[i].velocity = v; }, true)}
                onCycle={() => onEdit('Hit voice', (p) => {
                  const x = p.hits[i];
                  if (role === 'comp') (x as CompHit).voice = VOICES[(VOICES.indexOf((x as CompHit).voice) + 1) % VOICES.length];
                  else if (role === 'bass') (x as BassHit).degree = DEGREES[(DEGREES.indexOf((x as BassHit).degree) + 1) % DEGREES.length];
                })}
                onTogglePush={() => onEdit('Hit push', (p) => { const x = p.hits[i]; x.push = x.push ? undefined : Math.max(0.25, Math.round((beatsPerBar - (x.beat % beatsPerBar)) * 4) / 4); })}
                onDelete={() => onEdit('Deleted hit', (p) => { p.hits.splice(i, 1); })}
              />
            ))}
          </div>
        </div>
      ))}
      {role === 'drums' && !readOnly && (
        <div className="flex items-center gap-2 text-[10px] text-zinc-400">
          <span className="w-20 shrink-0">add row</span>
          <select className="field !py-0 text-[10px]" value={addDrum} onChange={(e) => setAddDrum(Number(e.target.value))}>
            {DRUM_CHOICES.map((d) => <option key={d} value={d}>{GM_DRUM_NAMES[d] ?? d}</option>)}
          </select>
          <button className="btn !py-0" onClick={() => onEdit('Added drum row', (p) => { if (!(p.hits as DrumHit[]).some((h) => h.drum === addDrum)) p.hits.push({ beat: 0, duration: 0.25, velocity: 90, drum: addDrum } as DrumHit); })}>+ {GM_DRUM_NAMES[addDrum]} on beat 1</button>
        </div>
      )}
    </div>
  );
}

interface HitProps {
  role: Role; hit: AnyHit; readOnly: boolean; cols: number;
  onMove: (beat: number, coalesce: boolean) => void;
  onResize: (dur: number, coalesce: boolean) => void;
  onVelocity: (v: number) => void;
  onCycle: () => void;
  onTogglePush: () => void;
  onDelete: () => void;
}

function HitBlock({ role, hit, readOnly, cols, onMove, onResize, onVelocity, onCycle, onTogglePush, onDelete }: HitProps) {
  const [drag, setDrag] = useState<{ mode: 'move' | 'resize'; x0: number; beat0: number; dur0: number } | null>(null);
  const left = hit.beat * 4 * CELL;
  const w = Math.max(CELL * 0.8, hit.duration * 4 * CELL - 2);
  const label = role === 'comp' ? VOICE_LABEL[(hit as CompHit).voice] : role === 'bass' ? DEGREE_LABEL[(hit as BassHit).degree] : '';
  const color = role === 'comp' ? 'bg-sky-500' : role === 'bass' ? 'bg-emerald-500' : 'bg-rose-500';
  return (
    <div
      data-hit="1"
      className={`absolute top-1 bottom-1 rounded ${color} text-[10px] font-semibold text-zinc-950 flex items-center justify-center select-none ${readOnly ? '' : 'cursor-grab'}`}
      style={{ left, width: w, opacity: 0.35 + (hit.velocity / 127) * 0.65 }}
      title={`beat ${hit.beat + 1} · ${hit.duration} beats · vel ${hit.velocity}${hit.push ? ` · push ${hit.push}` : ''}${hit.chordTypes ? ` · ${hit.chordTypes.join('/')}` : ''}`}
      onPointerDown={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        const edge = e.clientX > e.currentTarget.getBoundingClientRect().right - 6;
        setDrag({ mode: edge ? 'resize' : 'move', x0: e.clientX, beat0: hit.beat, dur0: hit.duration });
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const dBeats = Math.round(((e.clientX - drag.x0) / CELL)) / 4;
        if (drag.mode === 'move') onMove(Math.max(0, Math.min(cols / 4 - 0.25, drag.beat0 + dBeats)), true);
        else onResize(Math.max(0.25, drag.dur0 + dBeats), true);
      }}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
      onClick={(e) => { e.stopPropagation(); if (!readOnly && e.shiftKey) onTogglePush(); }}
      onDoubleClick={(e) => { e.stopPropagation(); if (!readOnly) onDelete(); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!readOnly) onCycle(); }}
      onWheel={(e) => { if (readOnly) return; e.stopPropagation(); onVelocity(Math.max(1, Math.min(127, hit.velocity - Math.sign(e.deltaY) * 4))); }}
    >
      {label}{hit.push ? <span className="ml-0.5">→</span> : null}
    </div>
  );
}

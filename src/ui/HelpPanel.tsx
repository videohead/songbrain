import { Fragment, useState, type ReactNode } from 'react';
import { HELP_TOPICS } from '../help';
import { Modal } from './Modal';
import type { Song } from '../model/song';
import { STANDARDS, songFromStandard } from '../help/standards';

/** Inline markdown: `code` and **bold**. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('`') ? <code key={i} className="px-1 rounded bg-zinc-800 text-purple-200 text-[0.85em]">{p.slice(1, -1)}</code>
      : p.startsWith('**') ? <strong key={i} className="text-zinc-100">{p.slice(2, -2)}</strong>
        : <Fragment key={i}>{p}</Fragment>);
}

/** Small renderer for the help files: headings, paragraphs, lists, fenced code. */
function Markdown({ source }: { source: string }) {
  const out: ReactNode[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('```')) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      out.push(<pre key={i} className="my-3 p-3 rounded bg-zinc-950 border border-zinc-800 text-xs overflow-x-auto">{code.join('\n')}</pre>);
    } else if (l.startsWith('# ')) out.push(<h1 key={i} className="text-lg font-semibold mb-2">{inline(l.slice(2))}</h1>);
    else if (l.startsWith('## ')) out.push(<h2 key={i} className="text-sm font-semibold text-purple-300 mt-5 mb-1">{inline(l.slice(3))}</h2>);
    else if (/^(\d+\.|-) /.test(l)) {
      const ordered = /^\d+\./.test(l);
      const items: string[] = [];
      while (i < lines.length && /^(\d+\.|-) /.test(lines[i])) items.push(lines[i++].replace(/^(\d+\.|-) /, ''));
      i--;
      const Tag = ordered ? 'ol' : 'ul';
      out.push(<Tag key={i} className={`${ordered ? 'list-decimal' : 'list-disc'} pl-5 my-2 space-y-1`}>{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</Tag>);
    } else if (l.trim()) out.push(<p key={i} className="my-2">{inline(l)}</p>);
  }
  return <div className="text-sm text-zinc-300 leading-relaxed">{out}</div>;
}

function Standards({ onLoad }: { onLoad: (song: Song) => void }) {
  return (
    <div>
      <h1 className="text-lg font-semibold mb-2">Quick-start charts</h1>
      <p className="text-sm text-zinc-300 my-2">Pick a common rock, hip-hop or funk chord pattern to put in the editor, then press play. Each loads with a style that suits it, and you can change it from the Style menu. These are generic progressions, not any one song. Loading replaces the current song; <strong className="text-zinc-100">Ctrl+Z</strong> brings it back.</p>
      <ul className="mt-3 space-y-2">
        {STANDARDS.map((s) => {
          const bars = s.sections.reduce((n, x) => n + x.bars.length, 0);
          return (
            <li key={s.id} className="flex items-start gap-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-semibold text-zinc-100">{s.title}</div>
                <div className="text-xs text-zinc-500">{s.genre} · {s.key} · {s.meter} · {bars} bars</div>
                <div className="text-xs text-zinc-400 mt-1">{s.blurb}</div>
              </div>
              <button className="btn btn-primary shrink-0" onClick={() => onLoad(songFromStandard(s))}>Load</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function HelpPanel({ onClose, onLoadTrainingChart, onLoadSong, onTrain }: { onClose: () => void; onLoadTrainingChart: () => void; onLoadSong: (song: Song) => void; onTrain: () => void }) {
  const [id, setId] = useState(HELP_TOPICS[0].id);
  const topic = HELP_TOPICS.find((t) => t.id === id) ?? HELP_TOPICS[0];
  return (
    <Modal title="Help" onClose={onClose} wide>
      <div className="flex flex-col md:flex-row">
        <nav className="flex md:flex-col gap-1 p-2 md:w-52 shrink-0 border-b md:border-b-0 md:border-r border-zinc-800 overflow-x-auto">
          {HELP_TOPICS.map((t) => (
            <button key={t.id} onClick={() => setId(t.id)} className={`text-left text-xs px-2 py-1.5 rounded whitespace-nowrap ${t.id === id ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800'}`}>{t.title}</button>
          ))}
        </nav>
        <article className="p-4 min-w-0 flex-1">
          {topic.id === 'standards' ? <Standards onLoad={(song) => { onLoadSong(song); onClose(); }} /> : <Markdown source={topic.body} />}
          <div className="flex flex-wrap gap-2 mt-4">
            {topic.id === 'chart' && <button className="btn btn-primary" onClick={() => { onLoadTrainingChart(); onClose(); }}>Load training chart</button>}
            {topic.id === 'train' && <button className="btn btn-primary" onClick={() => { onClose(); onTrain(); }}>Train a style…</button>}
          </div>
        </article>
      </div>
    </Modal>
  );
}

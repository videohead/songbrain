import { useEffect, type ReactNode } from 'react';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label={title} className={`flex flex-col max-h-full w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl`}>
        <header className="flex items-center px-4 py-2 border-b border-zinc-800">
          <h2 className="font-semibold text-sm">{title}</h2>
          <button className="btn ml-auto" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="min-h-0 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

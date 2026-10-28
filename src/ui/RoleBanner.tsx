import type { RelayRole } from '../relay/client';

export function RolePill({ role, tabs }: { role: RelayRole; tabs: number }) {
  const map: Record<RelayRole, { text: string; cls: string }> = {
    connecting: { text: 'connecting…', cls: 'bg-zinc-800 text-zinc-400' },
    editor: { text: tabs > 1 ? `editor · ${tabs} tabs` : 'editor', cls: 'bg-emerald-900/50 text-emerald-300' },
    readonly: { text: 'read-only', cls: 'bg-purple-900/50 text-purple-300' },
    offline: { text: 'offline · local only', cls: 'bg-zinc-800 text-zinc-400' },
  };
  const { text, cls } = map[role];
  return <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${cls}`} title="Relay status">{text}</span>;
}

export function RoleBanner({ onClaim }: { onClaim: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-purple-500/15 border-b border-purple-500/40 text-purple-200 text-sm">
      <span className="text-lg">🔒</span>
      <span>Another tab is the editor. This tab is read-only and its transport is locked; it follows the editor's changes live.</span>
      <button className="btn ml-auto" onClick={onClaim}>Make this tab the editor</button>
    </div>
  );
}

/**
 * Browser side of the editor relay.
 *
 * Connects to the server over WebSocket, claims the editor role when the tab
 * is focused, pushes song changes while editor, executes forwarded tool calls,
 * and adopts the mirrored song while read-only.
 */
import type { Song } from '../model/song';
import { executeTool, type SongStore, type ToolResult } from '../agent/tools';

export type RelayRole = 'connecting' | 'editor' | 'readonly' | 'offline';

export interface RelayState {
  role: RelayRole;
  tabs: number;
}

interface Handlers {
  store: SongStore;
  /** Apply a song that arrived from the server (not an edit by this tab). */
  applyRemote: (song: Song, label: string) => void;
  onState: (s: RelayState) => void;
}

type ServerMsg =
  | { type: 'role'; editor: boolean; tabs: number; song: Song | null }
  | { type: 'song'; song: Song }
  | { type: 'tool'; id: string; name: string; args: Record<string, unknown> };

function tabId(): string {
  try {
    let id = sessionStorage.getItem('songbrain.tabId');
    if (!id) { id = Math.random().toString(36).slice(2, 8); sessionStorage.setItem('songbrain.tabId', id); }
    return id;
  } catch { return Math.random().toString(36).slice(2, 8); }
}

export function createRelayClient(h: Handlers) {
  let ws: WebSocket | null = null;
  let state: RelayState = { role: 'connecting', tabs: 0 };
  let lastRemoteJson = '';
  let retry = 500;
  let closed = false;
  const id = tabId();

  const setState = (patch: Partial<RelayState>) => { state = { ...state, ...patch }; h.onState(state); };
  const send = (msg: unknown) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };

  function connect() {
    if (closed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      retry = 500;
      send({ type: 'hello', tabId: id });
      if (document.hasFocus()) send({ type: 'claim' });
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerMsg;
      switch (msg.type) {
        case 'role':
          setState({ role: msg.editor ? 'editor' : 'readonly', tabs: msg.tabs });
          if (msg.editor) {
            if (msg.song) {
              // The mirror holds the previous editor's latest state; adopt it.
              lastRemoteJson = JSON.stringify(msg.song);
              if (JSON.stringify(h.store.get()) !== lastRemoteJson) h.applyRemote(msg.song, 'Synced from server');
            } else {
              // No mirror yet: this tab's song becomes the mirror.
              pushSong(h.store.get());
            }
          } else if (msg.song) {
            lastRemoteJson = JSON.stringify(msg.song);
            if (JSON.stringify(h.store.get()) !== lastRemoteJson) h.applyRemote(msg.song, 'Viewing editor tab');
          }
          break;
        case 'song':
          lastRemoteJson = JSON.stringify(msg.song);
          h.applyRemote(msg.song, 'Updated by editor tab');
          break;
        case 'tool': {
          const result: ToolResult = state.role === 'editor'
            ? executeTool(h.store, msg.name, msg.args)
            : { ok: false, error: 'This tab is not the editor.' };
          send({ type: 'result', id: msg.id, result });
          break;
        }
      }
    };
    ws.onclose = () => {
      ws = null;
      setState({ role: 'offline', tabs: 0 });
      setTimeout(connect, retry);
      retry = Math.min(retry * 2, 8000);
    };
    ws.onerror = () => ws?.close();
  }

  function pushSong(song: Song) {
    if (state.role !== 'editor') return;
    const json = JSON.stringify(song);
    if (json === lastRemoteJson) return; // echo of something we just received
    lastRemoteJson = json;
    send({ type: 'song', song });
  }

  const onFocus = () => send({ type: 'claim' });
  window.addEventListener('focus', onFocus);
  connect();

  return {
    pushSong,
    claim: () => send({ type: 'claim' }),
    getState: () => state,
    dispose() {
      closed = true;
      window.removeEventListener('focus', onFocus);
      ws?.close();
    },
  };
}

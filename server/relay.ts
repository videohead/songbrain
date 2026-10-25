/**
 * Relay + mirror.
 *
 * The browser tab that holds the editor role owns the song. The server relays
 * tool calls to that tab over WebSocket and keeps a read-only mirror of the
 * last known song on disk so reads work when no editor is connected.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import type { Song } from '../src/model/song';
import { validateSong } from '../src/model/song';
import { executeTool, type ToolResult } from '../src/agent/tools';

export const WRITE_TOOLS = new Set(['UpdateSong', 'TransposeSong', 'InsertProgression', 'UpdateStyle', 'SetSectionStyle', 'SetTransition', 'AuditionStyle']);
const TOOL_TIMEOUT_MS = 15_000;

interface TabInfo { id: string; connectedAt: number }

type ClientMsg =
  | { type: 'hello'; tabId: string }
  | { type: 'claim' }
  | { type: 'song'; song: Song }
  | { type: 'result'; id: string; result: ToolResult };

type ServerMsg =
  | { type: 'role'; editor: boolean; tabs: number; song: Song | null }
  | { type: 'song'; song: Song }
  | { type: 'tool'; id: string; name: string; args: Record<string, unknown> };

export interface RelayStatus {
  editorConnected: boolean;
  editorTabId: string | null;
  tabs: number;
  hasMirror: boolean;
  mirrorUpdatedAt: string | null;
}

export interface Relay {
  status(): RelayStatus;
  mirror(): Song | null;
  /** Execute a tool: via the editor tab if connected, otherwise read-only against the mirror. */
  executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}

export function createRelay(httpServer: Server, dataDir: string): Relay {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'song.json');
  let mirror: Song | null = loadMirror(file);
  let mirrorUpdatedAt: string | null = mirror ? new Date(fs.statSync(file).mtimeMs).toISOString() : null;
  let saveTimer: NodeJS.Timeout | null = null;

  const tabs = new Map<WebSocket, TabInfo>();
  let editor: WebSocket | null = null;
  const pending = new Map<string, { resolve: (r: ToolResult) => void; timer: NodeJS.Timeout }>();
  let nextId = 1;

  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url?.split('?')[0] !== '/ws') return; // leave other upgrades (Vite HMR) alone
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  function send(ws: WebSocket, msg: ServerMsg) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
  function broadcastRoles() {
    for (const ws of tabs.keys()) send(ws, { type: 'role', editor: ws === editor, tabs: tabs.size, song: ws === editor ? mirror : null });
  }
  function setMirror(song: Song, fromEditor: boolean) {
    mirror = song;
    mirrorUpdatedAt = new Date().toISOString();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => fs.writeFile(file, JSON.stringify(song, null, 2), () => {}), 250);
    if (fromEditor) for (const ws of tabs.keys()) if (ws !== editor) send(ws, { type: 'song', song });
  }
  function grantEditor(ws: WebSocket) {
    if (editor === ws) return;
    editor = ws;
    // Fail any tool calls that were waiting on the previous editor.
    for (const [id, p] of pending) { clearTimeout(p.timer); p.resolve({ ok: false, error: 'Editor changed while the tool was running.' }); pending.delete(id); }
    broadcastRoles();
    log(`editor -> ${tabs.get(ws)?.id}`);
  }

  wss.on('connection', (ws) => {
    tabs.set(ws, { id: 'unknown', connectedAt: Date.now() });
    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      switch (msg.type) {
        case 'hello':
          tabs.get(ws)!.id = msg.tabId;
          if (!editor) grantEditor(ws);
          else send(ws, { type: 'role', editor: false, tabs: tabs.size, song: mirror });
          break;
        case 'claim':
          grantEditor(ws);
          break;
        case 'song':
          if (ws !== editor) return;
          if (validateSong(msg.song).ok) setMirror(msg.song, true);
          break;
        case 'result': {
          const p = pending.get(msg.id);
          if (!p) return;
          clearTimeout(p.timer);
          pending.delete(msg.id);
          p.resolve(msg.result);
          break;
        }
      }
    });
    ws.on('close', () => {
      const info = tabs.get(ws);
      tabs.delete(ws);
      if (editor === ws) {
        editor = null;
        log(`editor ${info?.id} disconnected`);
        // Promote the most recently connected remaining tab, if any.
        const next = [...tabs.entries()].sort((a, b) => b[1].connectedAt - a[1].connectedAt)[0]?.[0];
        if (next) grantEditor(next); else broadcastRoles();
      } else broadcastRoles();
    });
  });

  function relayTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    return new Promise((resolve) => {
      const id = String(nextId++);
      const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: 'Editor tab did not respond in time.' }); }, TOOL_TIMEOUT_MS);
      pending.set(id, { resolve, timer });
      send(editor!, { type: 'tool', id, name, args });
    });
  }

  return {
    status: () => ({ editorConnected: !!editor, editorTabId: editor ? tabs.get(editor)?.id ?? null : null, tabs: tabs.size, hasMirror: !!mirror, mirrorUpdatedAt }),
    mirror: () => mirror,
    async executeTool(name, args) {
      if (editor) return relayTool(name, args);
      if (WRITE_TOOLS.has(name)) return { ok: false, error: 'No editor connected. Open Song Brain in a browser tab to enable edits.' };
      if (!mirror) return { ok: false, error: 'No song available: no editor connected and no mirror on disk yet.' };
      const snapshot = mirror;
      return executeTool({ get: () => snapshot, set: () => { throw new Error('Mirror is read-only.'); } }, name, args);
    },
  };
}

function loadMirror(file: string): Song | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return validateSong(parsed).ok ? (parsed as Song) : null;
  } catch { return null; }
}

function log(msg: string) { console.log(`[relay] ${msg}`); }

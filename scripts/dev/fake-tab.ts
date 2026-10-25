/**
 * Headless "editor tab" for testing the relay without a browser.
 * Usage: npx tsx scripts/dev/fake-tab.ts [ws://localhost:5173/ws]
 */
import WebSocket from 'ws';
import { defaultSong, type Song } from '../../src/model/song';
import { executeTool } from '../../src/agent/tools';

const url = process.argv[2] ?? 'ws://localhost:5173/ws';
let song: Song = defaultSong();
const ws = new WebSocket(url);
const send = (m: unknown) => ws.send(JSON.stringify(m));
const store = { get: () => song, set: (s: Song, d: string) => { song = s; console.log('[tab] set:', d); send({ type: 'song', song }); } };

ws.on('open', () => { send({ type: 'hello', tabId: 'fake' }); send({ type: 'claim' }); });
ws.on('message', (raw) => {
  const msg = JSON.parse(String(raw));
  if (msg.type === 'role') {
    console.log('[tab] role:', msg.editor ? 'editor' : 'readonly', 'tabs:', msg.tabs);
    if (msg.editor) { if (msg.song) song = msg.song; send({ type: 'song', song }); }
  } else if (msg.type === 'tool') {
    console.log('[tab] tool:', msg.name, JSON.stringify(msg.args));
    send({ type: 'result', id: msg.id, result: executeTool(store, msg.name, msg.args) });
  }
});
ws.on('close', () => process.exit(0));

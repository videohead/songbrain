/**
 * MCP server over Streamable HTTP (stateless). Exposes the Song Brain tools to
 * any MCP client (Claude Desktop, Claude Code, Cursor...). Every call goes
 * through the relay, so the editor tab stays the owner of the song.
 */
import type { Express, Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';
import type { Relay } from './relay';
import type { ToolExecutor } from './tools';
import type { ToolResult } from '../src/agent/tools';
import type { createStyleLibrary } from './styles';

type StyleLibrary = ReturnType<typeof createStyleLibrary>;

const chordSchema = z.object({ symbol: z.string().describe('Chord symbol, e.g. "Cm7", "F7", "BbMaj7", "Am7b5", "N.C."'), beats: z.number().positive() });
const measureSchema = z.object({ chords: z.array(chordSchema) });
const sectionSchema = z.object({ name: z.string(), measures: z.array(measureSchema) });
const trackSchema = z.object({
  id: z.string(), name: z.string(), role: z.enum(['chords', 'bass', 'drums']),
  program: z.number().int().min(0).max(127).describe('General MIDI program'), channel: z.number().int().min(1).max(16),
  level: z.number().int().min(0).max(127), pan: z.number().int().min(0).max(127), reverb: z.number().int().min(0).max(127),
  mute: z.boolean(), solo: z.boolean(),
  voicing: z.enum(['close', 'shell', 'rootless', 'drop2', 'guitar']).optional(),
  bassStyle: z.enum(['roots', 'roots-fifths', 'walking']).optional(),
});
const songSchema = z.object({
  title: z.string(),
  key: z.string().describe('e.g. "G Minor" or "Bb Major"'),
  tempo: z.number().positive(),
  meter: z.string().describe('e.g. "4/4"'),
  sections: z.array(sectionSchema),
  tracks: z.array(trackSchema).optional().describe('Instrumentation and mix; copy unchanged unless asked.'),
  arrangement: z.object({
    defaultStyle: z.string(),
    sections: z.record(z.string(), z.string()).optional().describe('section index → style id'),
    substyles: z.record(z.string(), z.enum(['a', 'b'])).optional().describe('section index → substyle (b = busier/chorus)'),
    seed: z.number().int().optional(),
    fills: z.boolean().optional(),
    transitions: z.array(z.object({ beforeSection: z.number().int().min(0), bars: z.number().positive(), kind: z.enum(['rush', 'relax']), amount: z.number().min(0).max(1) })).optional(),
  }).optional().describe('Which style plays each section.'),
  styles: z.record(z.string(), z.unknown()).optional().describe('Embedded custom styles keyed by id; copy unchanged unless asked.'),
});

function toContent(r: ToolResult) {
  if (!r.ok) return { isError: true, content: [{ type: 'text' as const, text: `ERROR: ${r.error}` }] };
  return { content: [{ type: 'text' as const, text: JSON.stringify(r.result, null, 2) }] };
}

export function buildMcpServer(tools: ToolExecutor, relay: Relay, styles: StyleLibrary): McpServer {
  const server = new McpServer({ name: 'song-brain', version: '0.2.0' });
  const call = (name: string) => async (args: Record<string, unknown>) => toContent(await tools.executeTool(name, args));
  void relay; void styles;

  server.registerTool('GetSong', {
    title: 'Get song',
    description: 'Return the current song as JSON plus editor context (cursor measure and selected measure range, when a browser tab is connected). Call this before reasoning about or modifying the song. Measure numbers are 1-based and global across sections.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, call('GetSong'));

  server.registerTool('UpdateSong', {
    title: 'Replace song',
    description: 'Replace the entire song. Use for arbitrary edits (reharmonization, renaming sections, changing tempo/meter/title). Start from GetSong\'s `song` and change only what was asked. Each measure\'s chord beats must total the meter\'s beats.',
    inputSchema: { song: songSchema, summary: z.string().describe('One line describing the change, for the undo history.') },
    annotations: { destructiveHint: true },
  }, call('UpdateSong'));

  server.registerTool('TransposeSong', {
    title: 'Transpose song',
    description: 'Transpose the whole song. Give a target key ("Bb", "Eb Major", "F Minor") or a number of semitones (positive = up). A tonic alone keeps the current mode.',
    inputSchema: { toKey: z.string().optional(), semitones: z.number().int().min(-11).max(11).optional() },
  }, call('TransposeSong'));

  server.registerTool('AnalyzeProgression', {
    title: 'Analyze progression',
    description: 'Roman numerals relative to the key, harmonic function per chord, and detected idioms (ii-V-I, secondary dominants, tritone subs). Use to answer harmony questions or explain a measure.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, call('AnalyzeProgression'));

  server.registerTool('InsertProgression', {
    title: 'Insert progression',
    description: 'Insert measures before a 1-based global measure number (totalMeasures+1 appends). Each chord symbol fills one measure unless chordsPerMeasure groups them (2 = a ii-V in one bar). replaceCount > 0 replaces that many existing measures instead of inserting.',
    inputSchema: {
      beforeMeasure: z.number().int().min(1),
      chords: z.array(z.string()).min(1),
      chordsPerMeasure: z.number().int().min(1).optional(),
      replaceCount: z.number().int().min(0).optional(),
    },
  }, call('InsertProgression'));

  server.registerTool('ListStyles', {
    title: 'List styles',
    description: 'List available playing styles (presets, styles embedded in the song, server library) with id, name, feel and substyles.',
    inputSchema: {}, annotations: { readOnlyHint: true },
  }, call('ListStyles'));

  server.registerTool('GetStyle', {
    title: 'Get style',
    description: 'Full style document by id (preset, song-embedded or library). Without id: the style of the section at the editor cursor. Use before UpdateStyle.',
    inputSchema: { id: z.string().optional() }, annotations: { readOnlyHint: true },
  }, call('GetStyle'));

  server.registerTool('UpdateStyle', {
    title: 'Create or update style',
    description: 'Validate a style document, embed it in the song and save it to the library. Edited presets must get a new id and name. Shape: {id,name,description?,bars,beatsPerBar,feel{swing,pushPull,humanize,accents[],rolePushPull?},substyles{a,b?}} where each substyle has comp{variations[{hits[{beat,duration,velocity,voice,push?,chordTypes?}],weight?,bars?}],fills?,intro?,ending?,voicing?}, bass{style,variations[{hits[{beat,duration,velocity,degree}]}]}, drums{variations[{hits[{beat,duration,velocity,drum}]}],fills?}.',
    inputSchema: { style: z.record(z.string(), z.unknown()), summary: z.string() },
  }, call('UpdateStyle'));

  server.registerTool('SaveStyle', {
    title: 'Save style to library',
    description: 'Save a style that is embedded in the song (or a preset) to the server library by id.',
    inputSchema: { id: z.string() },
  }, call('SaveStyle'));

  server.registerTool('SetSectionStyle', {
    title: 'Set section style',
    description: 'Assign a style and/or substyle (a = verse, b = chorus/busier) to a section by index or name, or to "default".',
    inputSchema: { section: z.string(), styleId: z.string().optional(), substyle: z.enum(['a', 'b']).optional() },
  }, call('SetSectionStyle'));

  server.registerTool('SetTransition', {
    title: 'Set transition',
    description: 'Set or remove the transition into a section: over the last `bars` of the previous section, "rush" pushes ahead and lifts energy, "relax" lays back, softens and thins. amount 0..1.',
    inputSchema: { beforeSection: z.string(), bars: z.number().positive().optional(), kind: z.enum(['rush', 'relax']).optional(), amount: z.number().min(0).max(1).optional(), remove: z.boolean().optional() },
  }, call('SetTransition'));

  server.registerTool('AuditionStyle', {
    title: 'Audition style',
    description: 'Apply a style/substyle to a section (default: the section at the cursor) and loop-play it in the editor tab.',
    inputSchema: { styleId: z.string().optional(), substyle: z.enum(['a', 'b']).optional(), section: z.string().optional() },
  }, call('AuditionStyle'));

  server.registerResource('current-song', 'songbrain://song', { title: 'Current song', mimeType: 'application/json' }, async (uri) => {
    const r = await tools.executeTool('GetSong', {});
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: r.ok ? JSON.stringify(r.result, null, 2) : `ERROR: ${r.error}` }] };
  });

  return server;
}

/** Mount a stateless Streamable HTTP endpoint at /mcp. */
export function mountMcp(app: Express, tools: ToolExecutor, relay: Relay, styles: StyleLibrary) {
  app.post('/mcp', async (req: Request, res: Response) => {
    const server = buildMcpServer(tools, relay, styles);
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => { transport.close(); server.close(); });
    } catch (e) {
      console.error('[mcp]', e);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  });
  const notAllowed = (_req: Request, res: Response) => res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);
}

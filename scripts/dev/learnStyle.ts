/**
 * Learn a native Song Brain style from a MIDI file of a known chord chart, exported from any MIDI application
 * (DAW, automatic accompaniment program, MIDI accompaniment generator).
 *
 * Pipeline: export a MIDI file over a known chord chart, then run that MIDI through
 * the styleFromMidi learner.
 *
 * Usage (inside the dev container):
 *   npx tsx scripts/dev/learnStyle.ts <midiFile> --id <id> --name "<name>" \
 *     --chords "D,D,D,D,G,G,C,C" [--pattern-bars 1] [--start-bar N] \
 *     [--out styles/<id>.json] [--description "..."]
 *
 * Substyles (A / B): export each substyle to its own MIDI, learn A
 * first, then merge B into the same style with --substyle b. The result is one
 * Song Brain style whose substyles.a / substyles.b mirror the A / B variants
 * (B = busier/chorus). Example:
 *   npx tsx scripts/dev/learnStyle.ts crease-a.mid --id crease --name "Crease" --chords "..."
 *   npx tsx scripts/dev/learnStyle.ts crease-b.mid --id crease --substyle b --chords "..."
 *
 * --chords is one chord symbol per bar of the chart the MIDI was rendered over
 * (comma-separated). It must match the chart the MIDI was made from, e.g. the ii-v-i loop.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readMidi } from '../../src/engine/import/midiRead';
import { styleFromMidi } from '../../src/engine/style/learn';
import { validateStyle } from '../../src/model/style';
import type { Measure } from '../../src/model/song';

interface Args {
  midiFile: string;
  id?: string;
  name?: string;
  chords?: string;
  patternBars?: number;
  startBar?: number;
  out?: string;
  description?: string;
  beats?: number; // beats per bar per chord, default 4
  substyle?: 'a' | 'b'; // default 'a'; 'b' merges into substyles.b of the existing style
}

function parseArgs(argv: string[]): Args {
  const args: Args = { midiFile: '' };
  const rest = argv.slice(2);
  args.midiFile = rest[0] ?? '';
  for (let i = 1; i < rest.length; i++) {
    const a = rest[i];
    const next = () => rest[++i];
    if (a === '--id') args.id = next();
    else if (a === '--name') args.name = next();
    else if (a === '--chords') args.chords = next();
    else if (a === '--pattern-bars') args.patternBars = Number(next());
    else if (a === '--start-bar') args.startBar = Number(next());
    else if (a === '--out') args.out = next();
    else if (a === '--description') args.description = next();
    else if (a === '--beats') args.beats = Number(next());
    else if (a === '--substyle') args.substyle = next() as 'a' | 'b';
  }
  return args;
}

function buildChart(chords: string, beatsPerChord: number): Measure[] {
  return chords.split(',').map((s) => {
    const symbol = s.trim();
    if (!symbol) throw new Error('Empty chord symbol in --chords');
    return { chords: [{ symbol, beats: beatsPerChord }] };
  });
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.midiFile || !fs.existsSync(args.midiFile)) {
    console.error(`MIDI file not found: ${args.midiFile || '(none given)'}`);
    process.exit(1);
  }
  if (!args.chords) {
    console.error('--chords is required (one chord symbol per bar of the rendered chart)');
    process.exit(1);
  }
  const base = path.basename(args.midiFile).replace(/\.[^.]+$/, '');
  const id = args.id ?? base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const name = args.name ?? base;
  const chart = buildChart(args.chords, args.beats ?? 4);
  const substyle = args.substyle ?? 'a';

  // When merging substyle B, load the existing style (learned A pass) as the base.
  const out = args.out ?? path.join('styles', `${id}.json`);
  let into;
  if (substyle === 'b') {
    if (!fs.existsSync(out)) {
      console.error(`--substyle b requires an existing style at ${out} (learn substyle A first).`);
      process.exit(1);
    }
    into = JSON.parse(fs.readFileSync(out, 'utf8'));
  }

  const midi = readMidi(new Uint8Array(fs.readFileSync(args.midiFile)));
  const { style, report } = styleFromMidi(midi, {
    id,
    name,
    chart,
    patternBars: args.patternBars,
    startBar: args.startBar,
    source: args.midiFile,
    into,
    substyle,
  });
  if (args.description) style.description = args.description;

  const errors = validateStyle(style);
  if (errors.length) {
    console.error('Learned style failed validation:');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(style, null, 2));

  console.log(`✓ Learned style "${style.name}" (id=${style.id}) substyle=${substyle} -> ${out}`);
  console.log(`  roles: ${report.roles.map((r) => `${r.role}(${r.notes})`).join(', ')}`);
  console.log(`  startBar=${report.startBar} chartBars=${report.chartBars} endingBars=${report.endingBars}`);
  console.log(`  feel: swing=${report.swing} pushPull=${report.pushPullTicks}t humanize=${report.humanizeTicks}t`);
  for (const sid of ['a', 'b'] as const) {
    const s = style.substyles[sid];
    if (!s) continue;
    console.log(`  substyle ${sid}: comp=${s.comp?.variations.length ?? 0} bass=${s.bass?.variations.length ?? 0} drums=${s.drums?.variations.length ?? 0}`);
  }
}

main();

import gettingStarted from './getting-started.md?raw';
import createAChart from './create-a-chart.md?raw';
import chordSymbols from './chord-symbols.md?raw';
import pma5 from './pma5.md?raw';
import agent from './agent.md?raw';
import trainAStyle from './train-a-style.md?raw';
import trainingChart from './training-chart.md?raw';

export interface HelpTopic { id: string; title: string; body: string }

export const HELP_TOPICS: HelpTopic[] = [
  { id: 'start', title: 'Getting started', body: gettingStarted },
  { id: 'chart-howto', title: 'Create a chart', body: createAChart },
  { id: 'symbols', title: 'Chord symbols', body: chordSymbols },
  { id: 'standards', title: 'Quick-start charts', body: '' },
  { id: 'agent', title: 'The agent panel', body: agent },
  { id: 'train', title: 'Train a style from MIDI', body: trainAStyle },
  { id: 'pma5', title: 'Import from a Roland PMA-5', body: pma5 },
  { id: 'chart', title: 'Training chart', body: trainingChart },
];

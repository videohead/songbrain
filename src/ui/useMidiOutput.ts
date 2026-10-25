import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaybackController } from '../engine/playback';
import { listOutputs, loadPortSelection, midiSupported, requestMidiAccess, savePortSelection } from '../engine/midiOut';
import type { OutputState } from './TrackPanel';

export function useMidiOutput(playback: PlaybackController) {
  const [state, setState] = useState<OutputState>({ supported: midiSupported(), ports: [], selectedId: loadPortSelection() });
  const accessRef = useRef<MIDIAccess | null>(null);

  const applySelection = useCallback((id: string, access: MIDIAccess | null) => {
    const port = id && access ? access.outputs.get(id) : undefined;
    if (id && !port) {
      playback.setOutput({ kind: 'synth' });
      setState((s) => ({ ...s, selectedId: id, error: 'Selected MIDI port not found; using built-in synth until it reappears.' }));
      return;
    }
    playback.setOutput(port ? { kind: 'midi', port } : { kind: 'synth' });
    setState((s) => ({ ...s, selectedId: id, error: undefined }));
  }, [playback]);

  const refresh = useCallback(async () => {
    const access = await requestMidiAccess();
    accessRef.current = access;
    if (!access) { setState((s) => ({ ...s, ports: [], error: midiSupported() ? 'MIDI access denied.' : undefined })); return; }
    setState((s) => ({ ...s, ports: listOutputs(access) }));
    access.onstatechange = () => { setState((s) => ({ ...s, ports: listOutputs(access) })); applySelection(loadPortSelection(), access); };
    applySelection(loadPortSelection(), access);
  }, [applySelection]);

  // Restore a previously chosen port without prompting the user again (permission already granted).
  useEffect(() => { if (loadPortSelection()) void refresh(); }, [refresh]);

  const select = useCallback(async (id: string) => {
    savePortSelection(id);
    if (id && !accessRef.current) { await refresh(); return; }
    applySelection(id, accessRef.current);
  }, [applySelection, refresh]);

  return { output: state, selectOutput: select, refreshPorts: refresh };
}

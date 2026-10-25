import { useEffect, useRef, useState } from 'react';
import type { Song } from '../model/song';
import type { SongStore } from '../agent/tools';
import { createRelayClient, type RelayState } from '../relay/client';

export function useRelay(store: SongStore, song: Song, applyRemote: (song: Song, label: string) => void) {
  const [state, setState] = useState<RelayState>({ role: 'connecting', tabs: 0 });
  const clientRef = useRef<ReturnType<typeof createRelayClient> | null>(null);
  const applyRef = useRef(applyRemote);
  applyRef.current = applyRemote;

  useEffect(() => {
    const client = createRelayClient({ store, applyRemote: (s, l) => applyRef.current(s, l), onState: setState });
    clientRef.current = client;
    return () => { client.dispose(); clientRef.current = null; };
  }, [store]);

  // Push every local change while we hold the editor role.
  useEffect(() => { clientRef.current?.pushSong(song); }, [song]);

  return { ...state, claim: () => clientRef.current?.claim() };
}

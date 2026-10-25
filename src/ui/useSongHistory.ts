import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Song } from '../model/song';
import type { EditorContext } from '../agent/tools';
import { defaultSong, validateSong } from '../model/song';

const STORAGE_KEY = 'songbrain.song.v1';

interface HistoryEntry { song: Song; label: string }

function loadInitial(): Song {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (validateSong(parsed).ok) return parsed as Song;
    }
  } catch { /* ignore */ }
  return defaultSong();
}

export function useSongHistory() {
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [present, setPresent] = useState<HistoryEntry>(() => ({ song: loadInitial(), label: 'Loaded' }));
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const presentRef = useRef(present);
  presentRef.current = present;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(present.song)); } catch { /* ignore */ }
  }, [present]);

  /** Commit a change. With coalesce, consecutive commits with the same label collapse into one undo step. */
  const commit = useCallback((song: Song, label: string, opts?: { coalesce?: boolean }) => {
    if (!(opts?.coalesce && presentRef.current.label === label)) setPast((p) => [...p.slice(-99), presentRef.current]);
    setPresent({ song, label });
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [presentRef.current, ...f]);
      setPresent(prev);
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, presentRef.current]);
      setPresent(next);
      return f.slice(1);
    });
  }, []);

  /** Replace the song with one that arrived from the server, without creating an undo step. */
  const applyRemote = useCallback((song: Song, label: string) => {
    setPresent({ song, label });
  }, []);

  const contextRef = useRef<EditorContext>({ cursorMeasure: 1, selection: null, playback: 'stopped' });
  const auditionRef = useRef<((sectionIndex: number) => void) | null>(null);
  const setAudition = useCallback((fn: (sectionIndex: number) => void) => { auditionRef.current = fn; }, []);
  const setContext = useCallback((ctx: EditorContext) => { contextRef.current = ctx; }, []);

  /** Stable store for the agent: always reads the latest song and editor context. */
  const store = useMemo(() => ({
    get: () => presentRef.current.song,
    set: (song: Song, description: string) => commit(song, description),
    context: () => contextRef.current,
    audition: (si: number) => auditionRef.current?.(si),
  }), [commit]);

  return { song: present.song, label: present.label, commit, applyRemote, setContext, setAudition, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0, store };
}

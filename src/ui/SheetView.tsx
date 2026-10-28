/**
 * Lead sheet view: renders the song's MusicXML with OpenSheetMusicDisplay.
 * Read-only by design; the grid is the editor. Chords remain the vibe.
 */
import { useEffect, useRef, useState } from 'react';
import type { Song } from '../model/song';
import { songToMusicXml } from '../engine/export/musicxml';

interface Props { song: Song; currentMeasure: number }

export function SheetView({ song, currentMeasure }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<import('opensheetmusicdisplay').OpenSheetMusicDisplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
        if (cancelled || !host.current) return;
        if (!osmdRef.current) {
          osmdRef.current = new OpenSheetMusicDisplay(host.current, {
            autoResize: true, backend: 'svg', drawTitle: true, drawComposer: false, drawPartNames: false, drawMeasureNumbers: true,
            drawingParameters: 'compact', renderSingleHorizontalStaffline: false,
          });
          osmdRef.current.setLogLevel('warn');
        }
        await osmdRef.current.load(songToMusicXml(song, { parts: 'lead' }));
        if (cancelled) return;
        osmdRef.current.render();
        setReady(true);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [song]);

  // Follow the cursor: OSMD's cursor can be stepped per measure via its iterator.
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || !ready) return;
    try {
      const cursor = osmd.cursor;
      if (!cursor) return;
      cursor.show();
      cursor.reset();
      let guard = 0;
      while (!cursor.iterator.EndReached && cursor.iterator.CurrentMeasureIndex < currentMeasure - 1 && guard++ < 10_000) cursor.next();
    } catch { /* cursor is cosmetic */ }
  }, [currentMeasure, ready]);

  return (
    <div className="h-full overflow-auto bg-white text-black rounded-lg p-2">
      {error && <div className="text-rose-600 text-sm p-2">Sheet rendering failed: {error}</div>}
      <div ref={host} className="osmd" />
    </div>
  );
}

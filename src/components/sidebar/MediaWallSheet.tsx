import React, { useEffect, useState } from 'react';
import { ScanLine, Tv } from 'lucide-react';
import { describeWall, isWallScanSupported, scanWalls, wallsFromScan } from '../../native/wallScan';
import type { ScannedWall } from '../../types/furniture';
import { autoBaseCount, MEDIA_WALL_DEFAULTS, MEDIA_WALL_TAG, type UpperStyle } from '../../generators/mediaWall';
import { useProjectStore } from '../../state/useProjectStore';
import { useReliableTap } from '../../utils/reliableTap';

interface Props {
  isPhone: boolean;
  onDone: () => void;
}

const fieldStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13 };
const inputStyle: React.CSSProperties = { width: 72, padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.5)', fontSize: 14, textAlign: 'right', background: 'transparent', color: 'inherit' };

const WallChoice: React.FC<{ wall: ScannedWall; onPick: (w: ScannedWall) => void }> = ({ wall, onPick }) => {
  const tap = useReliableTap(() => onPick(wall));
  return (
    <button type="button" onClick={tap} onPointerUp={tap}
      style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, fontSize: 13, border: '1px solid rgba(148,163,184,0.5)', background: 'transparent', color: 'inherit' }}>
      {describeWall(wall)}
    </button>
  );
};

/** Collapsed row in the templates list; expands into the short media wall form. */
export const MediaWallSheet: React.FC<Props> = ({ isPhone, onDone }) => {
  const insertMediaWall = useProjectStore((s) => s.insertMediaWall);
  const [open, setOpen] = useState(false);
  const [wallWidth, setWallWidth] = useState(MEDIA_WALL_DEFAULTS.wallWidth);
  const [wallHeight, setWallHeight] = useState(MEDIA_WALL_DEFAULTS.wallHeight);
  const [tvSize, setTvSize] = useState(MEDIA_WALL_DEFAULTS.tvSize);
  const [baseCount, setBaseCount] = useState<number | null>(null);
  const [upperStyle, setUpperStyle] = useState<UpperStyle>('shelves');
  const [baseDepth, setBaseDepth] = useState(MEDIA_WALL_DEFAULTS.baseDepth);
  const setScannedWall = useProjectStore((s) => s.setScannedWall);
  const scannedWall = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.scannedWall);
  const [canScan, setCanScan] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ScannedWall[] | null>(null);

  useEffect(() => {
    let alive = true;
    void isWallScanSupported().then((ok) => { if (alive) setCanScan(ok); });
    return () => { alive = false; };
  }, []);

  const applyWall = (wall: ScannedWall) => {
    setWallWidth(Math.round(wall.width));
    setWallHeight(Math.round(wall.height));
    setBaseCount(null);
    setScannedWall(wall);
    setCandidates(null);
  };

  const startScan = async () => {
    if (scanning) return;
    setScanError(null);
    setScanning(true);
    try {
      const walls = wallsFromScan(await scanWalls());
      if (walls.length === 0) setScanError('No walls found. Try scanning again.');
      else if (walls.length === 1) applyWall(walls[0]);
      else setCandidates(walls);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(msg)) setScanError(msg);
    } finally {
      setScanning(false);
    }
  };

  const generate = () => {
    const { projects, activeProjectId } = useProjectStore.getState();
    const proj = projects.find((p) => p.id === activeProjectId);
    const exists = proj?.objects.some((o) => o.generator === MEDIA_WALL_TAG);
    if (exists && !window.confirm('Replace the media wall already in this project?')) return;
    if (insertMediaWall({ wallWidth, wallHeight, tvSize, baseCount: baseCount ?? autoBaseCount(wallWidth), upperStyle, baseDepth })) {
      setOpen(false);
      onDone();
    }
  };

  const toggleTap = useReliableTap(() => setOpen((v) => !v));
  const generateTap = useReliableTap(generate);
  const scanTap = useReliableTap(() => { void startScan(); });
  const clearScanTap = useReliableTap(() => setScannedWall(undefined));
  const upperTap = { shelves: useReliableTap(() => setUpperStyle('shelves')), cabinets: useReliableTap(() => setUpperStyle('cabinets')) };

  const num = (label: string, value: number, set: (n: number) => void, testId: string) => (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input type="number" inputMode="decimal" data-testid={testId} value={value}
        onChange={(e) => set(Number(e.target.value))} style={inputStyle} />
    </label>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button type="button" className={isPhone ? 'phone-sheet-row' : 'glass-button'} data-testid="media-wall-open"
        aria-expanded={open} onClick={toggleTap} onPointerUp={toggleTap}
        style={isPhone ? undefined : { justifyContent: 'flex-start', width: '100%', padding: '12px' }}>
        <Tv size={18} color={isPhone ? '#64748b' : '#e09f3e'} style={{ marginRight: 10, flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Media wall</span>
          <span style={{ fontSize: 11, color: '#9ca3af', textAlign: 'left' }}>Base cabinets, centered TV panel, matching uppers.</span>
        </div>
      </button>
      {open && (
        <div data-testid="media-wall-form" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 4px 8px' }}>
          {canScan && (
            <button type="button" data-testid="mw-scan" onClick={scanTap} onPointerUp={scanTap} disabled={scanning}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 10,
                border: '1px solid rgba(224,159,62,0.7)', background: 'transparent', color: '#e09f3e', fontWeight: 600, fontSize: 13 }}>
              <ScanLine size={16} /> {scanning ? 'Scanning…' : 'Scan wall'}
            </button>
          )}
          {scanError && <span style={{ fontSize: 12, color: '#ef4444' }}>{scanError}</span>}
          {candidates && (
            <div data-testid="mw-wall-picker" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>Pick the wall for the media wall:</span>
              {candidates.map((w) => (
                <WallChoice key={w.id} wall={w} onPick={applyWall} />
              ))}
            </div>
          )}
          {scannedWall && !candidates && (
            <div style={{ ...fieldStyle, fontSize: 12, color: '#9ca3af' }}>
              <span>Scanned: {describeWall(scannedWall)}</span>
              <button type="button" data-testid="mw-clear-scan" onClick={clearScanTap} onPointerUp={clearScanTap}
                style={{ border: 'none', background: 'transparent', color: '#e09f3e', fontSize: 12 }}>Clear</button>
            </div>
          )}
          {num('Wall width (in)', wallWidth, setWallWidth, 'mw-width')}
          {num('Wall height (in)', wallHeight, setWallHeight, 'mw-height')}
          {num('TV size (in)', tvSize, setTvSize, 'mw-tv')}
          {num('Base cabinets', baseCount ?? autoBaseCount(wallWidth), (n) => setBaseCount(n), 'mw-count')}
          {num('Base depth (in)', baseDepth, setBaseDepth, 'mw-depth')}
          <div style={fieldStyle}>
            <span>Uppers</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['shelves', 'cabinets'] as const).map((style) => (
                <button key={style} type="button" data-testid={`mw-upper-${style}`} onClick={upperTap[style]} onPointerUp={upperTap[style]}
                  style={{ padding: '6px 10px', borderRadius: 8, fontSize: 13, border: '1px solid rgba(148,163,184,0.5)',
                    background: upperStyle === style ? '#e09f3e' : 'transparent', color: upperStyle === style ? '#fff' : 'inherit' }}>
                  {style === 'shelves' ? 'Open shelves' : 'Cabinets'}
                </button>
              ))}
            </div>
          </div>
          <button type="button" data-testid="mw-generate" onClick={generateTap} onPointerUp={generateTap}
            style={{ marginTop: 4, padding: '10px 12px', borderRadius: 10, border: 'none', background: '#e09f3e', color: '#fff', fontWeight: 700, fontSize: 14 }}>
            Generate
          </button>
        </div>
      )}
    </div>
  );
};

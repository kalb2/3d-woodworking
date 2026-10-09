import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import {
  MEDIA_WALL_DEFAULTS,
  projectHasMediaWall,
  suggestBaseCabinetCount,
} from '../../catalog/mediaWall';
import { useProjectStore } from '../../state/useProjectStore';
import { useReliableTap } from '../../utils/reliableTap';
import type { MediaWallParams } from '../../types/furniture';

interface MediaWallSheetProps {
  onBack: () => void;
  onDone: () => void;
}

function Field({
  label,
  testId,
  value,
  onChange,
  step = '0.5',
  inputMode = 'decimal',
}: {
  label: string;
  testId: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
  inputMode?: 'decimal' | 'numeric';
}) {
  return (
    <label className="media-wall-field">
      {label}
      <input
        className="glass-input"
        data-testid={testId}
        inputMode={inputMode}
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function startingParams(): MediaWallParams {
  const { projects, activeProjectId } = useProjectStore.getState();
  const project = projects.find((item) => item.id === activeProjectId);
  const existing = project?.objects.find((object) => object.shape === 'group' && object.mediaWall);
  if (existing?.mediaWall) return existing.mediaWall;
  return {
    ...MEDIA_WALL_DEFAULTS,
    baseCount: suggestBaseCabinetCount(MEDIA_WALL_DEFAULTS.wallWidth),
  };
}

export const MediaWallSheet: React.FC<MediaWallSheetProps> = ({ onBack, onDone }) => {
  const initial = startingParams();
  const [width, setWidth] = useState(String(initial.wallWidth));
  const [height, setHeight] = useState(String(initial.wallHeight));
  const [tv, setTv] = useState(String(initial.tvSize));
  const [count, setCount] = useState(String(initial.baseCount));
  const [countDirty, setCountDirty] = useState(false);
  const [depth, setDepth] = useState(String(initial.baseDepth));
  const [uppers, setUppers] = useState<MediaWallParams['uppers']>(initial.uppers);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const hasWall = useProjectStore((state) => {
    const project = state.projects.find((item) => item.id === state.activeProjectId);
    return project ? projectHasMediaWall(project.objects) : false;
  });
  const applyMediaWall = useProjectStore((state) => state.applyMediaWall);

  const read = (value: string): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const onWidth = (value: string) => {
    setWidth(value);
    setConfirming(false);
    if (countDirty) return;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) setCount(String(suggestBaseCabinetCount(parsed)));
  };

  const generate = () => {
    const wallWidth = read(width);
    const wallHeight = read(height);
    const tvSize = read(tv);
    const baseDepth = read(depth);
    const baseCount = read(count);
    if (wallWidth === null || wallHeight === null || tvSize === null || baseDepth === null || baseCount === null) {
      setError('Enter sizes greater than 0.');
      setConfirming(false);
      return;
    }
    setError('');
    if (hasWall && !confirming) {
      setConfirming(true);
      return;
    }
    applyMediaWall({
      wallWidth,
      wallHeight,
      tvSize,
      baseDepth,
      baseCount: Math.round(baseCount),
      uppers,
    });
    onDone();
  };

  const back = useReliableTap(onBack);
  const submit = useReliableTap(generate);
  const cancelReplace = useReliableTap(() => setConfirming(false));

  return (
    <div className="media-wall-form" data-testid="media-wall-sheet">
      <button type="button" className="media-wall-back" data-testid="media-wall-back" onClick={back} onPointerUp={back}>
        <ChevronLeft size={18} />
        Layouts
      </button>
      <p className="media-wall-note">
        Type the wall, then generate cabinets, a counter, and a centered TV backer. Parts stay editable.
      </p>
      <div className="media-wall-grid">
        <Field label="Wall width (in)" testId="media-wall-width" value={width} onChange={onWidth} />
        <Field label="Wall height (in)" testId="media-wall-height" value={height} onChange={(value) => { setHeight(value); setConfirming(false); }} />
        <Field label="TV size (in)" testId="media-wall-tv" value={tv} onChange={(value) => { setTv(value); setConfirming(false); }} />
        <Field label="Base depth (in)" testId="media-wall-depth" value={depth} onChange={(value) => { setDepth(value); setConfirming(false); }} />
      </div>
      <Field
        label="Base cabinets"
        testId="media-wall-count"
        value={count}
        step="1"
        inputMode="numeric"
        onChange={(value) => {
          setCount(value);
          setCountDirty(true);
          setConfirming(false);
        }}
      />
      <div className="media-wall-field">
        Uppers
        <div className="media-wall-choices">
          <button
            type="button"
            className={`glass-button${uppers === 'shelves' ? ' active' : ''}`}
            data-testid="media-wall-uppers-shelves"
            onClick={() => { setUppers('shelves'); setConfirming(false); }}
          >
            Open shelves
          </button>
          <button
            type="button"
            className={`glass-button${uppers === 'cabinets' ? ' active' : ''}`}
            data-testid="media-wall-uppers-cabinets"
            onClick={() => { setUppers('cabinets'); setConfirming(false); }}
          >
            Cabinets
          </button>
        </div>
      </div>
      {error && <p className="media-wall-warning" data-testid="media-wall-error">{error}</p>}
      {confirming && (
        <p className="media-wall-warning" data-testid="media-wall-confirm">
          Replace the media wall already in this project? Edits to the generated parts will be lost.
        </p>
      )}
      <div className="media-wall-actions">
        {confirming && (
          <button type="button" className="glass-button" data-testid="media-wall-cancel" onClick={cancelReplace} onPointerUp={cancelReplace}>
            Cancel
          </button>
        )}
        <button type="button" className="glass-button active" data-testid="media-wall-generate" onClick={submit} onPointerUp={submit}>
          {confirming ? 'Replace media wall' : 'Generate'}
        </button>
      </div>
    </div>
  );
};

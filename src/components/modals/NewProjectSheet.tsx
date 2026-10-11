import React, { useEffect, useState } from 'react';
import { ScanLine, X } from 'lucide-react';
import { isWallScanSupported, scanWalls } from '../../native/wallScan';
import { roomFromScan } from '../../generators/roomScan';
import { useProjectStore } from '../../state/useProjectStore';
import { UNIT_CHOICES } from '../../utils/units';
import type { LengthUnit } from '../../types/furniture';

interface NewProjectSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export const NewProjectSheet: React.FC<NewProjectSheetProps> = ({ open, onClose, onCreated }) => {
  const { projects, createProject } = useProjectStore();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<LengthUnit>('in');
  const createProjectFromScan = useProjectStore((s) => s.createProjectFromScan);
  const [canScan, setCanScan] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void isWallScanSupported().then((ok) => { if (alive) setCanScan(ok); });
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  const scanRoom = async () => {
    if (scanning) return;
    setScanError(null);
    setScanning(true);
    try {
      const room = roomFromScan(await scanWalls());
      const title = name.trim() || `Room scan ${projects.length + 1}`;
      if (!createProjectFromScan(title, room, unit)) {
        setScanError('No walls found. Try scanning again.');
        return;
      }
      setName('');
      onCreated?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(msg)) setScanError(msg);
    } finally {
      setScanning(false);
    }
  };

  const submit = () => {
    const title = name.trim() || `Project ${projects.length + 1}`;
    createProject(title, unit);
    setName('');
    setUnit('in');
    onCreated?.();
    onClose();
  };

  return (
    <div className="new-project-backdrop" data-testid="new-project-sheet" onPointerUp={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form
        className="new-project-card-sheet glass-panel"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>New project</h2>
          <button type="button" className="glass-button" aria-label="Close" onClick={onClose} style={{ padding: 6, minHeight: 40, minWidth: 40 }}>
            <X size={16} />
          </button>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
          Name
          <input
            className="glass-input"
            data-testid="new-project-name"
            value={name}
            placeholder={`Project ${projects.length + 1}`}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Units</span>
          <div className="new-project-units" role="radiogroup" aria-label="Project units">
            {UNIT_CHOICES.map((choice) => (
              <button
                key={choice.id}
                type="button"
                role="radio"
                aria-checked={unit === choice.id}
                data-testid={`new-project-unit-${choice.id}`}
                className={unit === choice.id ? 'is-active' : ''}
                onClick={() => setUnit(choice.id)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        <button type="submit" className="glass-button active" data-testid="new-project-create" style={{ minHeight: 48 }}>
          Start building
        </button>
        {canScan && (
          <button type="button" className="glass-button" data-testid="new-project-scan" disabled={scanning}
            onClick={() => { void scanRoom(); }} style={{ minHeight: 44, gap: 8 }}>
            <ScanLine size={16} /> {scanning ? 'Scanning…' : 'Start from a room scan'}
          </button>
        )}
        {scanError && <span style={{ fontSize: 12, color: '#ef4444' }}>{scanError}</span>}
      </form>
    </div>
  );
};

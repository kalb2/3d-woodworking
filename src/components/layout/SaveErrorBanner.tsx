import React from 'react';
import { X } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';

/**
 * One small notice when saving on this device fails (usually storage is full).
 * Edits still sync for signed-in users; everyone should back up.
 */
export const SaveErrorBanner: React.FC = () => {
  const saveError = useProjectStore((s) => s.saveError);
  const dismiss = useProjectStore((s) => s.dismissSaveError);
  if (!saveError) return null;
  return (
    <div
      role="alert"
      className="save-error-banner"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        maxWidth: 'calc(100vw - 32px)',
        padding: '8px 8px 8px 14px',
        borderRadius: 12,
        background: 'rgba(255, 255, 255, 0.97)',
        border: '1px solid rgba(220, 38, 38, 0.35)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
        color: '#991b1b',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span>{saveError}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        style={{ display: 'flex', border: 0, background: 'transparent', color: 'inherit', padding: 4, cursor: 'pointer' }}
      >
        <X size={16} />
      </button>
    </div>
  );
};

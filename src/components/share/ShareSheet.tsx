import React, { useState } from 'react';
import { Check, Copy, Download, Link2, Share2, Smartphone, Users, X } from 'lucide-react';
import type { FurnitureProject } from '../../types/furniture';
import { copyProjectToClipboard, exportProjectJSON } from '../../utils/exportUtils';
import { canUseSystemShare, publishDeviceShare, systemShareProject } from '../../utils/share';

interface ShareSheetProps {
  project: FurnitureProject | null;
  onClose: () => void;
  onPublished?: () => void;
}

export const ShareSheet: React.FC<ShareSheetProps> = ({ project, onClose, onPublished }) => {
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!project) return null;

  const flash = (message: string) => {
    setNotice(message);
  };

  return (
    <div
      className="home-import-backdrop"
      onClick={onClose}
      data-testid="share-sheet-backdrop"
    >
      <div
        className="home-import-sheet share-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-sheet-title"
        onClick={(event) => event.stopPropagation()}
        data-testid="share-sheet"
      >
        <div className="home-import-sheet-header">
          <h2 id="share-sheet-title">Share “{project.name}”</h2>
          <button
            type="button"
            className="home-import-sheet-close"
            onClick={onClose}
            aria-label="Close share"
            data-testid="share-sheet-close"
          >
            <X size={20} />
          </button>
        </div>

        <p className="home-import-sheet-copy">
          Sharing stays on this device. Copy or send the project payload, or publish it to Community on this phone.
          Public links and accounts are not connected yet.
        </p>

        {notice && <div className="share-sheet-notice" data-testid="share-sheet-notice">{notice}</div>}

        <button
          type="button"
          className="glass-button active home-import-sheet-pick"
          data-testid="share-copy"
          onClick={() => {
            void copyProjectToClipboard(project).then((ok) => {
              setCopied(ok);
              flash(ok ? 'Share payload copied.' : 'Could not copy the payload.');
            });
          }}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
          <span>{copied ? 'Copied' : 'Copy share payload'}</span>
        </button>

        <button
          type="button"
          className="glass-button home-import-sheet-pick"
          data-testid="share-download"
          onClick={() => {
            exportProjectJSON(project);
            flash('Downloaded a .json file you can AirDrop or save to Files.');
          }}
        >
          <Download size={18} />
          <span>Download .json</span>
        </button>

        <button
          type="button"
          className="glass-button home-import-sheet-pick"
          data-testid="share-system"
          onClick={() => {
            if (!canUseSystemShare()) {
              flash('System share is not available here. Copy the payload instead.');
              return;
            }
            void systemShareProject(project).then((result) => {
              if (result === 'shared') flash('Sent through the system share sheet.');
              else if (result === 'failed') flash('System share failed. Copy the payload instead.');
              else if (result === 'unavailable') flash('System share is not available here.');
            });
          }}
        >
          <Share2 size={18} />
          <span>{canUseSystemShare() ? 'System share…' : 'System share unavailable'}</span>
        </button>

        <button
          type="button"
          className="glass-button home-import-sheet-pick"
          data-testid="share-publish"
          onClick={() => {
            publishDeviceShare(project);
            onPublished?.();
            flash('Published to Community on this device.');
          }}
        >
          <Users size={18} />
          <span>Publish on this device</span>
        </button>

        <div className="share-sheet-stub" data-testid="share-cloud-stub">
          <Link2 size={16} />
          <div>
            <strong>Cloud link</strong>
            <span>Stubbed. There is no public URL until an account service exists.</span>
          </div>
          <Smartphone size={16} />
        </div>
      </div>
    </div>
  );
};

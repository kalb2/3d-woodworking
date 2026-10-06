import React, { useMemo, useState } from 'react';
import { Box, Play, Sparkles, Trash2, Users } from 'lucide-react';
import { featuredTemplates, PROJECT_TEMPLATES } from '../../catalog/templates';
import { shapeLabel } from '../../catalog/shapeCatalog';
import type { PresetTemplate, TemplateCategory } from '../../types/furniture';
import type { DeviceShare } from '../../utils/share';

const CATEGORIES: Array<TemplateCategory | 'All'> = ['All', 'Blocks', 'Boards', 'Rounds', 'Layouts'];

function partCount(template: PresetTemplate): number {
  return template.objects.length;
}

export const TemplatesPanel: React.FC<{
  onStart: (templateId: string) => void;
  onPreview: (template: PresetTemplate) => void;
}> = ({ onStart, onPreview }) => {
  const [category, setCategory] = useState<TemplateCategory | 'All'>('All');
  const templates = useMemo(
    () => PROJECT_TEMPLATES.filter((template) => category === 'All' || template.category === category),
    [category],
  );

  return (
    <div className="library-panel" data-testid="templates-panel">
      <div className="library-intro">
        <h3>Start from a shape layout</h3>
        <p>
          These templates live in the app. Starting one creates a new project you can edit. Nothing is downloaded.
        </p>
      </div>
      <div className="library-chips" role="tablist" aria-label="Template categories">
        {CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={category === item}
            className={`library-chip${category === item ? ' is-active' : ''}`}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="projects-grid">
        {templates.map((template) => (
          <article key={template.id} className="project-card library-card" data-testid={`template-card-${template.id}`}>
            <div className="card-header">
              <div className="card-title">{template.name}</div>
            </div>
            <p className="library-card-copy">{template.description}</p>
            <div className="card-meta">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="card-badge">
                  <Box size={12} />
                  {partCount(template)} {partCount(template) === 1 ? 'shape' : 'shapes'}
                </span>
                <span className="library-kicker">{template.category}</span>
              </div>
              <span>{template.author ?? 'The Workbench'}</span>
            </div>
            <div className="card-actions">
              <button type="button" className="primary" data-testid={`template-start-${template.id}`} onClick={() => onStart(template.id)}>
                <Play size={13} />
                <span>Start</span>
              </button>
              <button type="button" data-testid={`template-preview-${template.id}`} onClick={() => onPreview(template)}>
                Preview
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export const CommunityPanel: React.FC<{
  shares: DeviceShare[];
  onStartTemplate: (templateId: string) => void;
  onPreviewTemplate: (template: PresetTemplate) => void;
  onOpenShare: (share: DeviceShare) => void;
  onPreviewShare: (share: DeviceShare) => void;
  onRemoveShare: (id: string) => void;
  onImportPayload: (text: string) => string | null;
}> = ({
  shares,
  onStartTemplate,
  onPreviewTemplate,
  onOpenShare,
  onPreviewShare,
  onRemoveShare,
  onImportPayload,
}) => {
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const featured = featuredTemplates();

  return (
    <div className="library-panel" data-testid="community-panel">
      <div className="library-intro">
        <h3>Community</h3>
        <p>
          Featured layouts are included with the app. Projects you publish stay on this device.
          A remote maker feed is not connected yet.
        </p>
      </div>

      <h4 className="library-section-title">Featured</h4>
      <div className="projects-grid">
        {featured.map((template) => (
          <article key={template.id} className="project-card library-card" data-testid={`community-template-${template.id}`}>
            <div className="card-header">
              <div className="card-title">{template.name}</div>
            </div>
            <p className="library-card-copy">{template.description}</p>
            <div className="card-meta">
              <span className="card-badge">
                <Sparkles size={12} />
                Included
              </span>
              <span>{template.category}</span>
            </div>
            <div className="card-actions">
              <button type="button" className="primary" onClick={() => onStartTemplate(template.id)}>
                <Play size={13} />
                <span>Start</span>
              </button>
              <button type="button" onClick={() => onPreviewTemplate(template)}>
                Preview
              </button>
            </div>
          </article>
        ))}
      </div>

      <h4 className="library-section-title">Shared on this device</h4>
      {shares.length === 0 ? (
        <div className="library-empty" data-testid="community-empty">
          <Users size={28} />
          <div>
            <strong>No local shares yet</strong>
            <p>Open a project, choose Share, then Publish on this device. It will show up here.</p>
          </div>
        </div>
      ) : (
        <div className="projects-grid" data-testid="community-local">
          {shares.map((share) => (
            <article key={share.id} className="project-card library-card" data-testid={`community-share-${share.id}`}>
              <div className="card-header">
                <div className="card-title">{share.title}</div>
              </div>
              <div className="card-meta">
                <span className="card-badge">
                  <Box size={12} />
                  {share.project.objects.length} shapes
                </span>
                <span>{new Date(share.sharedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="card-actions">
                <button type="button" className="primary" onClick={() => onOpenShare(share)}>
                  <Play size={13} />
                  <span>Open copy</span>
                </button>
                <button type="button" onClick={() => onPreviewShare(share)}>
                  Preview
                </button>
                <button
                  type="button"
                  className="danger"
                  aria-label={`Remove ${share.title}`}
                  onClick={() => onRemoveShare(share.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <form
        className="library-paste"
        data-testid="community-paste"
        onSubmit={(event) => {
          event.preventDefault();
          const error = onImportPayload(paste);
          if (error) {
            setPasteError(error);
            return;
          }
          setPaste('');
          setPasteError(null);
        }}
      >
        <h4 className="library-section-title">Paste a share payload</h4>
        <p>Paste JSON copied from Share on this or another phone. This imports a new project. It does not upload anywhere.</p>
        <textarea
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          placeholder='{"kind":"workbench-share","project":{...}}'
          rows={4}
          data-testid="community-paste-input"
        />
        {pasteError && <div className="library-paste-error">{pasteError}</div>}
        <button type="submit" className="glass-button active" data-testid="community-paste-import" disabled={!paste.trim()}>
          Import payload
        </button>
      </form>
    </div>
  );
};

export const TemplatePreviewSheet: React.FC<{
  title: string;
  description: string;
  badge: string;
  rows: Array<{ id: string; name: string; shape: string; size: string }>;
  onClose: () => void;
  onStart: () => void;
  startLabel: string;
}> = ({ title, description, badge, rows, onClose, onStart, startLabel }) => (
  <div className="home-import-backdrop" onClick={onClose} data-testid="template-preview-backdrop">
    <div
      className="home-import-sheet template-preview"
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-preview-title"
      onClick={(event) => event.stopPropagation()}
      data-testid="template-preview"
    >
      <div className="home-import-sheet-header">
        <h2 id="template-preview-title">{title}</h2>
        <button type="button" className="home-import-sheet-close" onClick={onClose} aria-label="Close preview">
          ×
        </button>
      </div>
      <p className="home-import-sheet-copy">{description}</p>
      <span className="card-badge">{badge}</span>
      <ul className="template-preview-list">
        {rows.map((row) => (
          <li key={row.id}>
            <strong>{row.name}</strong>
            <span>{shapeLabel(row.shape)}</span>
            <span>{row.size}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="glass-button active home-import-sheet-pick" data-testid="template-preview-start" onClick={onStart}>
        <Play size={18} />
        <span>{startLabel}</span>
      </button>
    </div>
  </div>
);

import React, { useEffect, useState, useRef } from 'react';
import {
  FolderOpen,
  Sliders,
  User,
  Users,
  GraduationCap,
  Plus,
  Play,
  Copy,
  Edit2,
  Trash2,
  Download,
  Upload,
  Check,
  Palette,
  Layers,
  Sparkles,
  Share2,
  Box,
  Compass,
  X
} from 'lucide-react';
import { useProjectStore, STANDARD_WOOD_PRESETS } from '../../state/useProjectStore';
import { useAppStore, ACCENT_COLOR_PRESETS } from '../../state/useAppStore';
import { useIsPhone } from '../../hooks/useIsPhone';
import { exportProjectJSON, importProjectFromJSON, copyProjectToClipboard } from '../../utils/exportUtils';

export const HomeScreen: React.FC = () => {
  const isPhone = useIsPhone();
  const [activeTab, setActiveTab] = useState<'projects' | 'presets' | 'profile' | 'community' | 'tutorials'>('projects');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isImportSheetOpen, setIsImportSheetOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    projects,
    activeProjectId,
    switchProject,
    createProject,
    renameProject,
    duplicateProject,
    deleteProject,
    importProject
  } = useProjectStore();

  const { setView, preferences, updatePreferences } = useAppStore();

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const handleOpenProject = (id: string) => {
    switchProject(id);
    setView('editor');
  };

  const handleCreateNew = () => {
    const defaultName = `Project ${projects.length + 1}`;
    createProject(defaultName);
    setView('editor');
  };

  const handleStartRename = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleSaveRename = (id: string) => {
    if (editingName.trim()) {
      renameProject(id, editingName.trim());
      showToast('Project renamed');
    }
    setEditingId(null);
  };

  const handleDuplicate = (id: string) => {
    duplicateProject(id);
    showToast('Project duplicated');
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete project "${name}"?`)) {
      deleteProject(id);
      showToast('Project deleted');
    }
  };

  const handleExportJSON = (e: React.MouseEvent, proj: any) => {
    e.stopPropagation();
    exportProjectJSON(proj);
    showToast(`Exported "${proj.name}.json"`);
  };

  const handleCopyShare = async (e: React.MouseEvent, proj: any) => {
    e.stopPropagation();
    const ok = await copyProjectToClipboard(proj);
    if (ok) {
      showToast('Project JSON copied to clipboard!');
    } else {
      showToast('Failed to copy to clipboard');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const imported = importProjectFromJSON(content);
        if (imported) {
          importProject(imported);
          setIsImportSheetOpen(false);
          showToast(`Imported "${imported.name}" successfully!`);
          handleOpenProject(imported.id);
        } else {
          showToast('Failed to parse project JSON file.');
        }
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (!isImportSheetOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsImportSheetOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isImportSheetOpen]);

  return (
    <div className={`home-screen${isPhone ? ' is-phone' : ''}`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast">
          <Sparkles size={16} color="var(--accent-primary)" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hidden File Input for Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportFile}
        accept=".json"
        style={{ display: 'none' }}
      />

      {/* Header — phone: brand only. Create/import live in the FAB bar. */}
      <header className="home-header">
        <div className="home-brand">
          <div className="home-brand-mark" aria-hidden="true">
            <Box size={isPhone ? 18 : 22} />
          </div>
          <div className="home-brand-text">
            <h1>3D Woodworking</h1>
            {!isPhone && (
              <div className="subtitle">Precision Woodworking & Parametric 3D Mockup Builder</div>
            )}
          </div>
        </div>

        <div className="home-header-actions">
          <button
            className="glass-button"
            onClick={() => fileInputRef.current?.click()}
            title="Import Project JSON"
          >
            <Upload size={16} />
            <span>Import JSON</span>
          </button>

          <button
            className="glass-button active"
            onClick={handleCreateNew}
          >
            <Plus size={18} />
            <span>New Project</span>
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="home-tabs">
        <button
          className={`home-tab ${activeTab === 'projects' ? 'active' : ''}`}
          onClick={() => setActiveTab('projects')}
        >
          <FolderOpen size={18} />
          <span>Projects ({projects.length})</span>
        </button>

        <button
          className={`home-tab ${activeTab === 'presets' ? 'active' : ''}`}
          onClick={() => setActiveTab('presets')}
        >
          <Sliders size={18} />
          <span>{isPhone ? 'Presets' : 'Presets & Preferences'}</span>
        </button>

        <button
          className={`home-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <User size={18} />
          <span>Profile</span>
        </button>

        <button
          className={`home-tab ${activeTab === 'community' ? 'active' : ''}`}
          onClick={() => setActiveTab('community')}
        >
          <Users size={18} />
          <span>Community</span>
        </button>

        <button
          className={`home-tab ${activeTab === 'tutorials' ? 'active' : ''}`}
          onClick={() => setActiveTab('tutorials')}
        >
          <GraduationCap size={18} />
          <span>Tutorials</span>
        </button>
      </nav>

      {/* Content Area */}
      <main className="home-content">
        {/* PROJECTS TAB */}
        {activeTab === 'projects' && (
          <div className="projects-grid">
            {/* Desktop / iPad create card — phone uses the FAB instead */}
            <div className="new-project-card" onClick={handleCreateNew}>
              <div className="icon-circle">
                <Plus size={28} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-main)' }}>Create New Project</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Start from an editable starting cube</div>
              </div>
            </div>

            {/* Existing Project Cards */}
            {projects.map((proj) => {
              const isActive = proj.id === activeProjectId;
              const isEditing = editingId === proj.id;
              const formattedDate = new Date(proj.updatedAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={proj.id}
                  className={`project-card ${isActive ? 'active' : ''}`}
                  onClick={() => handleOpenProject(proj.id)}
                >
                  <div className="card-header">
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6, width: '100%' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          className="glass-input"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(proj.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                        <button
                          className="glass-button active"
                          onClick={() => handleSaveRename(proj.id)}
                          style={{ padding: '4px 10px', minHeight: 'auto', minWidth: 'auto' }}
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="card-title">{proj.name}</div>
                    )}
                  </div>

                  <div className="card-meta">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="card-badge">
                        <Box size={12} />
                        {proj.objects.length} parts
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Unit: {proj.unit}</span>
                      {isActive && (
                        <span style={{ fontSize: 10, background: 'var(--accent-primary)', color: '#ffffff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <span>Modified: {formattedDate}</span>
                  </div>

                  <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="primary"
                      onClick={() => handleOpenProject(proj.id)}
                      title="Open 3D Canvas Editor"
                    >
                      <Play size={13} />
                      <span>Open</span>
                    </button>

                    <button
                      onClick={() => handleStartRename(proj.id, proj.name)}
                      title="Rename"
                    >
                      <Edit2 size={13} />
                    </button>

                    <button
                      onClick={() => handleDuplicate(proj.id)}
                      title="Duplicate Project"
                    >
                      <Copy size={13} />
                    </button>

                    <button
                      onClick={(e) => handleCopyShare(e, proj)}
                      title="Copy JSON to Clipboard"
                    >
                      <Share2 size={13} />
                    </button>

                    <button
                      onClick={(e) => handleExportJSON(e, proj)}
                      title="Download .json file"
                    >
                      <Download size={13} />
                    </button>

                    {projects.length > 1 && (
                      <button
                        className="danger"
                        onClick={() => handleDelete(proj.id, proj.name)}
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PRESETS & PREFERENCES TAB */}
        {activeTab === 'presets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text-main)' }}>
                Application Theme & Preferences
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                Customize your primary accent color, default units, viewport background, and snapping behaviors.
              </p>

              <div className="prefs-grid">
                {/* Primary Accent Color Selector */}
                <div className="prefs-card" style={{ gridColumn: 'span 1' }}>
                  <h4>
                    <Palette size={16} />
                    Primary Accent Color
                  </h4>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '-4px 0 6px' }}>
                    Personalize buttons, highlights, badges, and selection gizmos across the entire studio.
                  </p>
                  
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {ACCENT_COLOR_PRESETS.map((preset) => {
                      const isSelected = preferences.accentColor?.toLowerCase() === preset.color.toLowerCase();
                      return (
                        <button
                          key={preset.id}
                          className={`color-swatch-btn ${isSelected ? 'active' : ''}`}
                          onClick={() => updatePreferences({ accentColor: preset.color })}
                          style={{ backgroundColor: preset.color }}
                          title={`${preset.name} (${preset.color})`}
                        >
                          {isSelected && <Check size={14} color="#ffffff" strokeWidth={3} />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="prefs-row" style={{ marginTop: 8, borderTop: '1px solid var(--panel-border)', paddingTop: 10 }}>
                    <label>Custom Accent Color</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="color"
                        value={preferences.accentColor || '#d97706'}
                        onChange={(e) => updatePreferences({ accentColor: e.target.value })}
                        style={{ width: 36, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'none' }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 600 }}>
                        {preferences.accentColor}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Viewport Canvas Style */}
                <div className="prefs-card">
                  <h4>
                    <Box size={16} />
                    3D Canvas Background
                  </h4>
                  <div className="prefs-row">
                    <label>Background Studio Tone</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="color"
                        value={preferences.backgroundColor}
                        onChange={(e) => updatePreferences({ backgroundColor: e.target.value })}
                        style={{ width: 36, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'none' }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {preferences.backgroundColor}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    {[
                      { color: '#f8fafc', name: 'Crisp White' },
                      { color: '#f1f5f9', name: 'Light Slate' },
                      { color: '#ffffff', name: 'Pure White' },
                      { color: '#e2e8f0', name: 'Studio Gray' },
                      { color: '#fef3c7', name: 'Warm Cream' },
                      { color: '#0f172a', name: 'Dark Studio' }
                    ].map(item => (
                      <button
                        key={item.color}
                        onClick={() => updatePreferences({ backgroundColor: item.color })}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          backgroundColor: item.color,
                          border: preferences.backgroundColor === item.color ? '2px solid var(--accent-primary)' : '1px solid #cbd5e1',
                          cursor: 'pointer',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}
                        title={item.name}
                      />
                    ))}
                  </div>
                </div>

                {/* Default Measurements */}
                <div className="prefs-card">
                  <h4>
                    <Sliders size={16} />
                    Default Units
                  </h4>
                  <div className="prefs-row">
                    <label>Measurement System</label>
                    <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 3, borderRadius: 8, border: '1px solid #cbd5e1' }}>
                      {(['in', 'cm', 'mm'] as const).map(u => (
                        <button
                          key={u}
                          onClick={() => updatePreferences({ defaultUnit: u })}
                          style={{
                            background: preferences.defaultUnit === u ? 'var(--accent-primary)' : 'transparent',
                            color: preferences.defaultUnit === u ? '#ffffff' : 'var(--text-muted)',
                            border: 'none',
                            borderRadius: 6,
                            padding: '4px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Snapping & Floor Defaults */}
                <div className="prefs-card">
                  <h4>
                    <Compass size={16} />
                    Physics & Grid Snapping
                  </h4>
                  <div className="prefs-row">
                    <label>Floor Collision Barrier</label>
                    <button
                      className={`glass-button ${preferences.defaultFloorEnabled ? 'active' : ''}`}
                      onClick={() => updatePreferences({ defaultFloorEnabled: !preferences.defaultFloorEnabled })}
                      style={{ padding: '4px 14px', minHeight: 'auto', fontSize: 12 }}
                    >
                      {preferences.defaultFloorEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <div className="prefs-row">
                    <label>Magnetic Snap by Default</label>
                    <button
                      className={`glass-button ${preferences.defaultSnapEnabled ? 'active' : ''}`}
                      onClick={() => updatePreferences({ defaultSnapEnabled: !preferences.defaultSnapEnabled })}
                      style={{ padding: '4px 14px', minHeight: 'auto', fontSize: 12 }}
                    >
                      {preferences.defaultSnapEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Standard Lumber Presets Reference */}
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text-main)' }}>
                Standard Wood & Sheet Stock Catalog
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                Pre-configured standard cuts available directly inside the 3D editor sidebar.
              </p>

              <div className="projects-grid">
                {STANDARD_WOOD_PRESETS.map((preset) => (
                  <div key={preset.id} className="prefs-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: 'var(--accent-primary-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-primary)'
                      }}>
                        <Layers size={18} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-main)' }}>{preset.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{preset.description}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--panel-border)', paddingTop: 10 }}>
                      <span>L: <strong style={{ color: '#ef4444' }}>{preset.dimensions.length}"</strong></span>
                      <span>W: <strong style={{ color: '#3b82f6' }}>{preset.dimensions.width}"</strong></span>
                      <span>H: <strong style={{ color: '#10b981' }}>{preset.dimensions.height}"</strong></span>
                      <span>Finish: <strong style={{ color: 'var(--accent-primary)' }}>{preset.material.name}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <div className="placeholder-section">
            <div className="icon-large">
              <User size={36} color="var(--accent-primary)" />
            </div>
            <span className="coming-badge">Cloud Sync Coming Soon</span>
            <h3>Woodworker Profile & Cloud Workspace</h3>
            <p>
              Sign in with your Google or Apple account to seamlessly synchronize your custom furniture designs, cut lists, and material presets across all your iPad, desktop, and workshop devices.
            </p>
            <div className="glass-panel" style={{ padding: 16, borderRadius: 12, display: 'inline-flex', flexDirection: 'column', gap: 8, alignItems: 'center', marginTop: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Local Device Storage Active</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main)' }}>{projects.length} Saved Projects Stored Locally</span>
            </div>
          </div>
        )}

        {/* COMMUNITY TAB */}
        {activeTab === 'community' && (
          <div className="placeholder-section">
            <div className="icon-large">
              <Users size={36} color="var(--accent-primary)" />
            </div>
            <span className="coming-badge">Community Hub Coming Soon</span>
            <h3>Maker Showcase & Shared Blueprints</h3>
            <p>
              Discover and remix community-created dining tables, credenzas, floating shelves, and fine woodworking blueprints with full cut lists and assembly instructions.
            </p>
          </div>
        )}

        {/* TUTORIALS TAB */}
        {activeTab === 'tutorials' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text-main)' }}>
                Mastering 3D Woodworking
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                Quick tips and gestures for building realistic woodworking mockups on iPad and desktop.
              </p>
            </div>

            <div className="tutorials-grid">
              <div className="tutorial-card">
                <div className="step-num">1</div>
                <div>
                  <h4>Start with Shapes & Standard Cuts</h4>
                  <p>Open the Shapes tab in the left sidebar to add standard 4×8 plywood, 2×4 dimensional lumber, or basic boxes, cylinders, and bevel tops.</p>
                </div>
              </div>

              <div className="tutorial-card">
                <div className="step-num">2</div>
                <div>
                  <h4>Color-Coded 3D Gizmos</h4>
                  <p>Select any piece to reveal Red (X), Green (Y), and Blue (Z) handles. Switch between Move, Grab Resize, and Rotate modes in the top toolbar.</p>
                </div>
              </div>

              <div className="tutorial-card">
                <div className="step-num">3</div>
                <div>
                  <h4>Transparent Floor Barrier</h4>
                  <p>The ground plane prevents wood parts from falling below the shop floor (Y ≥ 0) and anchors your legs and base components accurately.</p>
                </div>
              </div>

              <div className="tutorial-card">
                <div className="step-num">4</div>
                <div>
                  <h4>Magnetic Surface Snapping</h4>
                  <p>Turn on Magnet mode to automatically snap table legs to tabletops and align panels edge-to-edge with 1.2" smart proximity.</p>
                </div>
              </div>

              <div className="tutorial-card">
                <div className="step-num">5</div>
                <div>
                  <h4>Procedural Wood & Stains</h4>
                  <p>Select any part and choose from Natural Oak, Dark Walnut, Mahogany, Rustic Pine, and apply custom stain density or glossy sheen in the bottom-right palette.</p>
                </div>
              </div>

              <div className="tutorial-card">
                <div className="step-num">6</div>
                <div>
                  <h4>Generate Cut Lists & Share</h4>
                  <p>Click "Cut List" in the header to view exact board dimensions and export your bill of materials to CSV spreadsheet or JSON project backup.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <div className="home-fab-bar" data-testid="home-fab-bar">
        <button
          type="button"
          className="home-fab-import"
          onClick={() => setIsImportSheetOpen(true)}
          title="Import project JSON"
          aria-label="Import project JSON"
          data-testid="home-fab-import"
        >
          <Upload size={20} />
        </button>
        <button
          type="button"
          className="home-fab-create"
          onClick={handleCreateNew}
          title="New Project"
          aria-label="New Project"
          data-testid="home-fab-create"
        >
          <Plus size={20} />
          <span>New Project</span>
        </button>
      </div>

      {isImportSheetOpen && (
        <div
          className="home-import-backdrop"
          onClick={() => setIsImportSheetOpen(false)}
          data-testid="import-sheet-backdrop"
        >
          <div
            className="home-import-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-sheet-title"
            onClick={(event) => event.stopPropagation()}
            data-testid="import-sheet"
          >
            <div className="home-import-sheet-header">
              <h2 id="import-sheet-title">Import JSON</h2>
              <button
                type="button"
                className="home-import-sheet-close"
                onClick={() => setIsImportSheetOpen(false)}
                aria-label="Close import"
                data-testid="import-sheet-close"
              >
                <X size={20} />
              </button>
            </div>
            <p className="home-import-sheet-copy">
              Choose a saved project JSON file to add it to your library.
            </p>
            <button
              type="button"
              className="glass-button active home-import-sheet-pick"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={18} />
              <span>Choose JSON file</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

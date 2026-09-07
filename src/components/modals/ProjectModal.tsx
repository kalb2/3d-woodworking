import React, { useState, useRef } from 'react';
import { FolderOpen, Plus, Edit2, Copy, Trash2, Check, X, Upload, Download, Share2 } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { exportProjectJSON, copyProjectToClipboard, importProjectFromJSON } from '../../utils/exportUtils';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({ isOpen, onClose }) => {
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleStartRename = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleSaveRename = (id: string) => {
    if (editingName.trim()) {
      renameProject(id, editingName.trim());
    }
    setEditingId(null);
  };

  const handleCreateNew = () => {
    if (newProjectName.trim()) {
      createProject(newProjectName.trim());
      setNewProjectName('');
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
          showStatus(`Imported "${imported.name}"!`);
        } else {
          showStatus('Failed to import JSON.');
        }
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCopyJSON = async (proj: any) => {
    const ok = await copyProjectToClipboard(proj);
    if (ok) {
      showStatus('JSON copied to clipboard!');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24
    }}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportFile}
        accept=".json"
        style={{ display: 'none' }}
      />

      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: 620,
          borderRadius: 20,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          maxHeight: '85vh'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FolderOpen size={24} color="#e09f3e" />
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Furniture Projects Manager</h2>
              {statusMessage && (
                <span style={{ fontSize: 12, color: '#e09f3e', fontWeight: 600 }}>{statusMessage}</span>
              )}
            </div>
          </div>

          <button
            className="glass-button"
            onClick={onClose}
            style={{ padding: 6, minHeight: 'auto', minWidth: 'auto', borderRadius: '50%' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Create New Project Input & Import */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="glass-input"
            placeholder="New Project Title (e.g. Dining Chair Set)..."
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateNew();
            }}
          />
          <button
            className="glass-button active"
            onClick={handleCreateNew}
            style={{ whiteSpace: 'nowrap' }}
          >
            <Plus size={16} /> Create
          </button>
          <button
            className="glass-button"
            onClick={() => fileInputRef.current?.click()}
            title="Import Project from JSON file"
            style={{ whiteSpace: 'nowrap' }}
          >
            <Upload size={16} /> Import
          </button>
        </div>

        {/* Project List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          {projects.map((proj) => {
            const isActive = proj.id === activeProjectId;
            const isEditing = editingId === proj.id;

            return (
              <div
                key={proj.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 14,
                  borderRadius: 12,
                  background: isActive ? 'rgba(224, 159, 62, 0.15)' : 'rgba(255,255,255,0.04)',
                  border: isActive ? '1px solid #e09f3e' : '1px solid rgba(255,255,255,0.1)',
                  gap: 12
                }}
              >
                {/* Project Title & Metadata */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        className="glass-input"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        autoFocus
                      />
                      <button
                        className="glass-button active"
                        onClick={() => handleSaveRename(proj.id)}
                        style={{ padding: '6px 10px', minHeight: 'auto' }}
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{proj.name}</span>
                      {isActive && (
                        <span style={{ fontSize: 10, background: '#e09f3e', color: '#000', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                  )}

                  <span style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                    {proj.objects.length} 3D components • Updated {new Date(proj.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!isActive && (
                    <button
                      className="glass-button"
                      onClick={() => {
                        switchProject(proj.id);
                        onClose();
                      }}
                      style={{ fontSize: 13 }}
                    >
                      Open
                    </button>
                  )}

                  <button
                    className="glass-button"
                    onClick={() => handleStartRename(proj.id, proj.name)}
                    title="Rename Project"
                    style={{ padding: 8, minHeight: 'auto', minWidth: 'auto' }}
                  >
                    <Edit2 size={16} />
                  </button>

                  <button
                    className="glass-button"
                    onClick={() => duplicateProject(proj.id)}
                    title="Duplicate Project"
                    style={{ padding: 8, minHeight: 'auto', minWidth: 'auto' }}
                  >
                    <Copy size={16} />
                  </button>

                  <button
                    className="glass-button"
                    onClick={() => handleCopyJSON(proj)}
                    title="Copy Project JSON to Clipboard"
                    style={{ padding: 8, minHeight: 'auto', minWidth: 'auto' }}
                  >
                    <Share2 size={16} />
                  </button>

                  <button
                    className="glass-button"
                    onClick={() => exportProjectJSON(proj)}
                    title="Download Project .json"
                    style={{ padding: 8, minHeight: 'auto', minWidth: 'auto' }}
                  >
                    <Download size={16} />
                  </button>

                  {projects.length > 1 && (
                    <button
                      className="glass-button"
                      onClick={() => deleteProject(proj.id)}
                      title="Delete Project"
                      style={{ padding: 8, minHeight: 'auto', minWidth: 'auto', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

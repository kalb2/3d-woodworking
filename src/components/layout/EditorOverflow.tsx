import React, { useState } from 'react';
import { Camera, FileCode, FileSpreadsheet, Layers, LayoutTemplate, Share2, Copy } from 'lucide-react';
import { useAppStore } from '../../state/useAppStore';
import { useProjectStore } from '../../state/useProjectStore';
import { copyProjectToClipboard, exportCutListCSV, exportProjectJSON } from '../../utils/exportUtils';
import { useReliableTap } from '../../utils/reliableTap';

interface EditorOverflowListProps {
  onOpenCutList: () => void;
  onShareProject: () => void;
  onClose: () => void;
}

const MenuRow: React.FC<{ icon: React.ReactNode; label: string; testId: string; onTap: () => void }> = ({ icon, label, testId, onTap }) => {
  const tap = useReliableTap(onTap);
  return (
    <button type="button" className="phone-sheet-row" data-testid={testId} onClick={tap} onPointerUp={tap}>
      {icon}
      <span>{label}</span>
    </button>
  );
};

/**
 * ••• is for getting things out of the project (export / share) and things that span
 * projects (templates). This project's own settings live in Properties › Project.
 */
export const EditorOverflowList: React.FC<EditorOverflowListProps> = ({ onOpenCutList, onShareProject, onClose }) => {
  const { openOverlay, setSidebarPanel } = useAppStore();
  const { activeProjectId, projects } = useProjectStore();
  const currentProject = projects.find((project) => project.id === activeProjectId);
  const [copied, setCopied] = useState(false);

  const snapshot = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${currentProject?.name.toLowerCase().replace(/\s+/g, '_') || 'workbench'}_render.png`;
      link.click();
    }
    onClose();
  };
  const copyJson = () => {
    if (!currentProject) return;
    void copyProjectToClipboard(currentProject).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(onClose, 700);
    });
  };

  return (
    <div className="editor-overflow-list">
      <h3 className="menu-kicker">Export &amp; share</h3>
      <MenuRow icon={<Layers size={18} />} label="Cut list" testId="menu-cut-list" onTap={() => { onClose(); onOpenCutList(); }} />
      <MenuRow icon={<Share2 size={18} />} label="Share project" testId="menu-share" onTap={() => { onClose(); onShareProject(); }} />
      <MenuRow icon={<FileSpreadsheet size={18} />} label="Export cut list (CSV)" testId="menu-export-csv" onTap={() => { if (currentProject) exportCutListCSV(currentProject); onClose(); }} />
      <MenuRow icon={<Camera size={18} />} label="Snapshot image" testId="menu-export-png" onTap={snapshot} />
      <MenuRow icon={<FileCode size={18} />} label="Export project file" testId="menu-export-json" onTap={() => { if (currentProject) exportProjectJSON(currentProject); onClose(); }} />
      <MenuRow icon={<Copy size={18} />} label={copied ? 'Copied' : 'Copy project JSON'} testId="menu-copy-json" onTap={copyJson} />
      <h3 className="menu-kicker">Across projects</h3>
      <MenuRow icon={<LayoutTemplate size={18} />} label="Templates" testId="menu-templates" onTap={() => { onClose(); setSidebarPanel('templates'); openOverlay('sidebar'); }} />
    </div>
  );
};

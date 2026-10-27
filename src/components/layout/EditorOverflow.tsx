import React, { useState } from 'react';
import { Archive, Box, Camera, FileCode, FileSpreadsheet, FileText, Layers, LayoutTemplate, Share2, Copy } from 'lucide-react';
import { useAppStore } from '../../state/useAppStore';
import { useProjectStore } from '../../state/useProjectStore';
import { copyProjectToClipboard, exportCutListCSV, exportProjectJSON } from '../../utils/exportUtils';
import { useReliableTap } from '../../utils/reliableTap';
import { backUpProjects } from '../../utils/projectFile';
import { saveFile, saveMessage, type SaveResult } from '../../native/fileExport';
import { designParts, exportDesignFile, type ModelFormat } from '../../utils/modelExport';

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

  /** The share sheet is the feedback on iOS; only say something when saving failed. */
  const report = (result: SaveResult) => { if (result === 'failed') window.alert(saveMessage(result, '')); };
  const snapshot = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const png = canvas.toDataURL('image/png').split(',')[1] ?? '';
      void saveFile(`${currentProject?.name.trim() || 'Workbench'} snapshot.png`, png, 'image/png', { base64: true, title: currentProject?.name }).then(report);
    }
    onClose();
  };
  const exportFile = () => {
    if (currentProject) void exportProjectJSON(currentProject).then(report);
    onClose();
  };
  const backUp = () => {
    void backUpProjects(projects).then(report);
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
  const exportModel = (format: ModelFormat) => {
    const project = currentProject;
    onClose();
    if (!project || designParts(project).length === 0) {
      window.alert('Nothing to export yet.');
      return;
    }
    void exportDesignFile(project, format).then(report);
  };
  /** Shop-ready PDF; the plans code (and jsPDF) load only when asked for. */
  const exportPlans = () => {
    const project = currentProject;
    onClose();
    if (!project || designParts(project).length === 0) {
      window.alert('Nothing to export yet.');
      return;
    }
    void import('../../plans/exportPlans')
      .then(({ exportBuildPlans }) => exportBuildPlans(project))
      .catch(() => 'failed' as const)
      .then(report);
  };

  return (
    <div className="editor-overflow-list">
      <h3 className="menu-kicker">Export &amp; share</h3>
      <MenuRow icon={<Layers size={18} />} label="Cut list" testId="menu-cut-list" onTap={() => { onClose(); onOpenCutList(); }} />
      <MenuRow icon={<Share2 size={18} />} label="Share project" testId="menu-share" onTap={() => { onClose(); onShareProject(); }} />
      <MenuRow icon={<FileSpreadsheet size={18} />} label="Export cut list (CSV)" testId="menu-export-csv" onTap={() => { if (currentProject) exportCutListCSV(currentProject); onClose(); }} />
      <MenuRow icon={<FileText size={18} />} label="Build plans (PDF)" testId="menu-export-plans" onTap={exportPlans} />
      <MenuRow icon={<Camera size={18} />} label="Snapshot image" testId="menu-export-png" onTap={snapshot} />
      <MenuRow icon={<FileCode size={18} />} label="Export project file" testId="menu-export-json" onTap={exportFile} />
      <MenuRow icon={<Box size={18} />} label="Export 3D model (USDZ)" testId="menu-export-usdz" onTap={() => exportModel('usdz')} />
      <MenuRow icon={<Box size={18} />} label="Export 3D model (GLB)" testId="menu-export-glb" onTap={() => exportModel('glb')} />
      <MenuRow icon={<Copy size={18} />} label={copied ? 'Copied' : 'Copy project JSON'} testId="menu-copy-json" onTap={copyJson} />
      <h3 className="menu-kicker">Across projects</h3>
      <MenuRow icon={<LayoutTemplate size={18} />} label="Templates" testId="menu-templates" onTap={() => { onClose(); setSidebarPanel('templates'); openOverlay('sidebar'); }} />
      <MenuRow icon={<Archive size={18} />} label="Back up all projects" testId="menu-backup" onTap={backUp} />
    </div>
  );
};

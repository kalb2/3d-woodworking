import { NumberField } from '../ui/NumberField';
import React, { useEffect, useState } from 'react';
import { BookmarkPlus, BoxSelect, SlidersHorizontal } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { useAppStore } from '../../state/useAppStore';
import { useIsPhone } from '../../hooks/useIsPhone';
import { OverlayDismissButton } from '../layout/OverlayChrome';
import { PHONE_SHEET_EMBEDDED_STYLE } from '../layout/phoneSheet';
import { PartColorSection } from './MaterialPicker';
import { unitScale } from '../../utils/units';
import type { FurnitureObject, FurnitureProject, RoutedEdge } from '../../types/furniture';
import { defaultBoardOptions } from '../../utils/boardGeometry';
import { shapeLabel } from '../../catalog/shapeCatalog';
import { supportsHoles } from '../../utils/holes';
import { HolesSection } from './HolesSection';
import { jointsOf } from '../../joinery/joints';
import { JointRows } from '../../joinery/JoinSheet';
import { useBuiltInFlow } from '../../builtins/useBuiltInFlow';
import { partsFromSelection, useUserTemplates } from '../../templates/userTemplates';
import { ActionRow, Row, Section, Seg } from '../properties/rows';
import { templateName, templateSummary } from '../../builtins/builtIns';
import { ProjectSection } from '../properties/ProjectSection';

/** Clean number: at most 2 decimals, no trailing zeros (24, 23.5, 0.75). */
export function formatMeasure(inches: number, scale: number) {
  const v = Math.round(inches * scale * 100) / 100;
  return String(Object.is(v, -0) ? 0 : v);
}

type Tab = 'part' | 'project';

/**
 * Properties: the selected part/group, plus this project's settings.
 * Two-segment header (<part name> | Project) when something is selected; Project otherwise.
 */
export const ObjectInspector: React.FC = () => {
  const isPhone = useIsPhone();
  const { overlays, setOverlayOpen } = useAppStore();
  const { projects, activeProjectId, selectedObjectId } = useProjectStore();
  const currentProject = projects.find((project) => project.id === activeProjectId);
  const object = currentProject?.objects.find((item) => item.id === selectedObjectId);
  const [tab, setTab] = useState<Tab>(object ? 'part' : 'project');
  // Each time the sheet opens or the selection changes: the selection if there is one, else Project.
  useEffect(() => { setTab(selectedObjectId ? 'part' : 'project'); }, [selectedObjectId, overlays.inspector]);

  if (!overlays.inspector || !currentProject) return null;
  const showPart = Boolean(object) && tab === 'part';
  const partLabel = object ? object.name || shapeLabel(object.shape) : '';

  return (
    <div
      className={`project-overlay project-overlay-inspector part-properties props${isPhone ? ' phone-sheet-embed' : ' glass-panel'}`}
      data-testid="overlay-inspector"
      style={isPhone ? {
        ...PHONE_SHEET_EMBEDDED_STYLE,
        padding: '0 16px 16px',
        overflowY: 'auto',
      } : {
        position: 'absolute',
        top: 'var(--ipad-panel-top)',
        right: 16,
        left: 'auto',
        width: 360,
        borderRadius: 16,
        zIndex: 40,
        padding: 16,
        maxHeight: 'calc(100dvh - var(--ipad-panel-top) - 24px - env(safe-area-inset-bottom, 0px))',
        overflowY: 'auto',
      }}
    >
      <div className="props-head">
        {object ? (
          <span className="props-tabs" role="tablist" aria-label="Properties">
            <button type="button" role="tab" aria-selected={tab === 'part'} className={tab === 'part' ? 'is-on' : ''}
              data-testid="props-tab-part" onClick={() => setTab('part')} title={partLabel}>
              <span>{partLabel}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'project'} className={tab === 'project' ? 'is-on' : ''}
              data-testid="props-tab-project" onClick={() => setTab('project')}>Project</button>
          </span>
        ) : (
          <span className="props-title">Project</span>
        )}
        <OverlayDismissButton showLabel onDismiss={() => setOverlayOpen('inspector', false)} />
      </div>
      {showPart && object ? <PartSection object={object} project={currentProject} /> : <ProjectSection />}
    </div>
  );
};

const EDGES: { id: RoutedEdge; label: string }[] = [
  { id: 'none', label: 'Square' }, { id: 'chamfer', label: 'Chamfer' }, { id: 'roundover', label: 'Round' },
];

const PartSection: React.FC<{ object: FurnitureObject; project: FurnitureProject }> = ({ object, project }) => {
  const updateObject = useProjectStore((s) => s.updateObject);
  const setOverlayOpen = useAppStore((s) => s.setOverlayOpen);
  const unit = project.unit;
  const scale = unitScale(unit);
  const isGroup = object.shape === 'group';
  const board = object.board ?? defaultBoardOptions();
  const dims = `${formatMeasure(object.dimensions.length, scale)} × ${formatMeasure(object.dimensions.width, scale)} × ${formatMeasure(object.dimensions.height, scale)} ${unit}`;
  const edgeSize = board.edgeSize ?? Math.min(object.dimensions.height * 0.42, 0.22);
  const close = () => setOverlayOpen('inspector', false);

  const partJoints = jointsOf(project, object.id).filter((j) => project.objects.some((o) => o.id === j.receiverId) && project.objects.some((o) => o.id === j.materId));
  let editTarget: FurnitureObject | undefined = object;
  while (editTarget && !editTarget.builtIn) editTarget = editTarget.parentId ? project.objects.find((x) => x.id === editTarget!.parentId) : undefined;
  const canSaveTemplate = object.generator !== 'room-scan' && !object.reference;

  return (
    <>
      <Section title={isGroup ? 'Group' : 'Part'} testId="props-part">
        <Row label="Name">
          <input className="props-input" data-testid="part-name" aria-label="Name" value={object.name}
            onChange={(e) => updateObject(object.id, { name: e.target.value })} />
        </Row>
        <Row label="Size"><span className="props-readout" data-testid="part-size">{dims}</span></Row>
      </Section>

      {object.shape === 'board' && (
        <Section title={`Board (${unit})`} testId="board-tools">
          <Row label="Corner radius">
            <NumberField className="props-input is-number" testId="board-corner-radius" min={0} aria-label="Corner radius"
              value={board.cornerRadius * scale} format={() => formatMeasure(board.cornerRadius, scale)}
              onCommit={(num) => updateObject(object.id, { board: { ...board, cornerRadius: num / scale } })} />
          </Row>
          <Row label="Edges">
            <Seg label="Edges" testId="board-edge" value={board.edge} options={EDGES}
              onChange={(edge) => updateObject(object.id, { board: { ...board, edge, edgeSize: edge === 'none' ? board.edgeSize : (board.edgeSize ?? 0.125) } })} />
          </Row>
          {board.edge !== 'none' && (
            <Row label="Edge size">
              <NumberField className="props-input is-number" testId="board-edge-size" aria-label="Edge size" min={0.01}
                value={edgeSize * scale} format={() => formatMeasure(edgeSize, scale)}
                onCommit={(num) => updateObject(object.id, { board: { ...board, edgeSize: num / scale } })} />
            </Row>
          )}
        </Section>
      )}

      {supportsHoles(object.shape) && (
        <section className="props-section">
          <h3 className="props-kicker">Cuts</h3>
          <HolesSection object={object} unit={unit} scale={scale} />
        </section>
      )}

      {!isGroup && (
        <section className="props-section">
          <h3 className="props-kicker">Finish</h3>
          <PartColorSection />
        </section>
      )}

      {partJoints.length > 0 && (
        <Section title="Joints" testId="props-joints">
          <JointRows project={project} joints={partJoints} partId={object.id} onOpen={close} />
        </Section>
      )}

      {editTarget?.builtIn && (
        <Section title="Template" testId="props-template">
          <Row label={templateName(editTarget)}><span className="props-readout" data-testid="template-summary">{templateSummary(editTarget, unit)}</span></Row>
          <ActionRow label="Edit template" icon={<SlidersHorizontal size={18} />} testId="menu-edit-template" onTap={() => {
            close();
            useBuiltInFlow.getState().startEdit(editTarget!.id, editTarget!.builtIn!.template, editTarget!.builtIn!.wallId);
          }} />
        </Section>
      )}

      <Section title="Selection" testId="props-selection">
        <ActionRow label="Select more" icon={<BoxSelect size={18} />} testId="menu-select-area" onTap={() => {
          const st = useProjectStore.getState();
          if (!st.multiSelect) st.toggleMultiSelect();
          close();
        }} />
        {canSaveTemplate && <ActionRow label="Save as template" icon={<BookmarkPlus size={18} />} testId="menu-save-template" onTap={() => {
          const parts = partsFromSelection(project.objects, object.id);
          if (parts.length === 0) { window.alert('Nothing to save in this selection.'); return; }
          const name = window.prompt('Save as template', object.name ?? 'Template');
          if (name === null) return;
          useUserTemplates.getState().save(name, parts);
        }} />}
      </Section>
    </>
  );
};

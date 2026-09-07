import React from 'react';
import { Layers, FileSpreadsheet, X } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';
import { generateCutList, exportCutListCSV } from '../../utils/exportUtils';

interface CutListDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CutListDrawer: React.FC<CutListDrawerProps> = ({ isOpen, onClose }) => {
  const { projects, activeProjectId } = useProjectStore();
  const currentProject = projects.find(p => p.id === activeProjectId);

  if (!isOpen || !currentProject) return null;

  const cutList = generateCutList(currentProject);

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
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: 680,
          borderRadius: 20,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          maxHeight: '85vh'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Layers size={24} color="#e09f3e" />
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Cut List & Bill of Materials</h2>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{currentProject.name}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="glass-button active"
              onClick={() => exportCutListCSV(currentProject)}
            >
              <FileSpreadsheet size={16} /> Export CSV
            </button>

            <button
              className="glass-button"
              onClick={onClose}
              style={{ padding: 6, minHeight: 'auto', minWidth: 'auto', borderRadius: '50%' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', color: '#e09f3e' }}>
                <th style={{ padding: '10px 12px' }}>Component Name</th>
                <th style={{ padding: '10px 12px' }}>Shape</th>
                <th style={{ padding: '10px 12px' }}>Length (X)</th>
                <th style={{ padding: '10px 12px' }}>Width (Z)</th>
                <th style={{ padding: '10px 12px' }}>Thickness (Y)</th>
                <th style={{ padding: '10px 12px' }}>Material Finish</th>
                <th style={{ padding: '10px 12px' }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {cutList.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                    No 3D objects in canvas yet. Add shapes to view cut list.
                  </td>
                </tr>
              ) : (
                cutList.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{item.name}</td>
                    <td style={{ padding: '10px 12px', color: '#9ca3af' }}>{item.shape}</td>
                    <td style={{ padding: '10px 12px', color: '#ef4444' }}>{item.length}</td>
                    <td style={{ padding: '10px 12px', color: '#3b82f6' }}>{item.width}</td>
                    <td style={{ padding: '10px 12px', color: '#10b981' }}>{item.height}</td>
                    <td style={{ padding: '10px 12px' }}>{item.material}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#e09f3e' }}>{item.quantity}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

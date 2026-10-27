import React from 'react';
import type { FurnitureObject, Joint, LengthUnit } from '../types/furniture';
import { formatSmallLen } from '../utils/lengthFormat';
import { DEFAULT_SCREW_LENGTH, dowelDiameter, dowelLength, jointGeometry } from './joints';

const W = 320, H = 150, PAD = 22;
const len = (n: number, unit: LengthUnit) => formatSmallLen(n, unit);

/**
 * Cross-section through the joint: the board that takes the cut below, the
 * mating board above, the cut, and dimension callouts. Pure from the joint, so
 * it redraws as fields change.
 */
export const JointDiagram: React.FC<{ joint: Joint; R: FurnitureObject; M: FurnitureObject; unit: LengthUnit; seated?: boolean }> = ({ joint: j, R, M, unit, seated }) => {
  const g = jointGeometry(j, R, M);
  if (!g) return null;
  const grooved = j.type === 'dado' || j.type === 'rabbet';
  const box = g.L.contact.box, t = g.L.t;
  const mat: [number, number] = [box.min[t], box.max[t]];
  const center = grooved ? (g.groove[0] + g.groove[1]) / 2 : (mat[0] + mat[1]) / 2;
  const halfWin = Math.max(g.matThick * 2.2, 1.6);
  const u0 = center - halfWin, u1 = center + halfWin;
  const rDown = Math.min(g.rThick, Math.max(1.25, g.matThick * 1.6));
  const mUp = Math.max(1.25, g.matThick * 1.6);
  const seat = grooved ? (seated ? j.depth : g.seat) : Math.max(0, g.seat);
  const k = Math.min((W - 2 * PAD) / (u1 - u0), (H - 2 * PAD) / (rDown + mUp));
  const X = (u: number) => PAD + (u - u0) * k;
  const Y = (v: number) => PAD + (mUp - v) * k;
  const clip = (a: number, b: number): [number, number] => [Math.max(u0, a), Math.min(u1, b)];
  const rect = (a: number, b: number, v0: number, v1: number) => ({ x: X(a), y: Y(v1), width: Math.max(0, X(b) - X(a)), height: Math.max(0, Y(v0) - Y(v1)) });
  const [r0, r1] = clip(-g.span / 2, g.span / 2);
  const [m0, m1] = clip(mat[0], mat[1]);
  const [c0, c1] = clip(g.groove[0], g.groove[1]);
  const cu = (mat[0] + mat[1]) / 2;
  const small = { fontSize: 11, fill: '#334155', fontWeight: 600 } as const;
  return (
    <svg className="joint-diagram" data-testid="joint-diagram" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Cross-section of the ${j.type} joint`}>
      <rect {...rect(r0, r1, -rDown, 0)} fill="#e7cfa8" stroke="#8a6a43" strokeWidth={1} />
      {grooved && <rect data-testid="diagram-cut" {...rect(c0, c1, -j.depth, 0)} fill="#ffffff" stroke="#c2410c" strokeDasharray="3 2" strokeWidth={1.2} />}
      <rect {...rect(m0, m1, -seat, mUp)} fill="#d9b98a" stroke="#8a6a43" strokeWidth={1} opacity={0.95} />
      {j.type === 'dowel' && (() => {
        const d = dowelDiameter(j), l = dowelLength(j);
        const rd = Math.min(l / 2, g.rThick * 0.6);
        return <rect data-testid="diagram-dowel" {...rect(cu - d / 2, cu + d / 2, -rd, l - rd)} fill="#f8e7c4" stroke="#92400e" strokeWidth={1.2} rx={2} />;
      })()}
      {j.type === 'pocket' && (() => {
        const sl = j.screwLength ?? DEFAULT_SCREW_LENGTH;
        const tip = Math.min(sl * 0.45, g.rThick * 0.7);
        return <line data-testid="diagram-screw" x1={X(mat[0] + 0.05)} y1={Y(Math.min(mUp - 0.1, sl - tip))} x2={X(cu)} y2={Y(-tip)} stroke="#334155" strokeWidth={2.5} strokeLinecap="round" />;
      })()}
      {/* Names */}
      <text x={X(r0) + 6} y={Y(-rDown) - 6} {...small}>{R.name}</text>
      <text x={X(m1) + 6} y={Y(mUp) + 14} {...small}>{M.name}</text>
      {/* Callouts */}
      {grooved && (
        <>
          <line x1={X(c0)} x2={X(c1)} y1={PAD - 8} y2={PAD - 8} stroke="#c2410c" strokeWidth={1} />
          <text data-testid="diagram-width" x={(X(c0) + X(c1)) / 2} y={PAD - 11} textAnchor="middle" {...small} fill="#c2410c">{len(g.grooveWidth, unit)} wide</text>
          <line x1={X(c1) + 8} x2={X(c1) + 8} y1={Y(0)} y2={Y(-j.depth)} stroke="#c2410c" strokeWidth={1} />
          <text data-testid="diagram-depth" x={X(c1) + 12} y={(Y(0) + Y(-j.depth)) / 2 + 4} {...small} fill="#c2410c">{len(j.depth, unit)} deep</text>
        </>
      )}
      {!grooved && (
        <text x={W / 2} y={PAD - 9} textAnchor="middle" {...small}>{M.name} meets {R.name}</text>
      )}
    </svg>
  );
};

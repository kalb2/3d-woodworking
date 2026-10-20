/** Screen-space box of one joint tag (pixels, centred on x/y). */
export interface TagBox { id: string; x: number; y: number; w: number; h: number }

/** Rough on-screen size of a joint tag: dot + padding + text at 13px bold. */
export const TAG_HEIGHT = 36;
export const tagWidth = (label: string) => Math.round(label.length * 7.6 + 44);

const overlaps = (a: TagBox, b: TagBox, gap: number) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w + gap * 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h + gap * 2;

/**
 * Groups tags whose boxes would overlap (transitively), so close joints share one chip.
 * Groups keep the input order of their first member; members are sorted top to bottom.
 */
export function clusterTags(boxes: TagBox[], gap = 4): string[][] {
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < boxes.length; i++) {
    for (let k = i + 1; k < boxes.length; k++) {
      if (overlaps(boxes[i], boxes[k], gap)) parent[find(k)] = find(i);
    }
  }
  const groups = new Map<number, TagBox[]>();
  boxes.forEach((b, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), b]);
  });
  return [...groups.values()].map((g) => g.sort((a, b) => a.y - b.y || a.x - b.x).map((b) => b.id));
}

export type TagStatus = 'fits' | 'check' | 'broken';
/** The chip shows the worst status in its group. */
export const worstStatus = (s: TagStatus[]): TagStatus => (s.includes('broken') ? 'broken' : s.includes('check') ? 'check' : 'fits');

/** Chip text: "3 joints", plus how many need a look. */
export function clusterLabel(statuses: TagStatus[]): string {
  const bad = statuses.filter((x) => x !== 'fits').length;
  return `${statuses.length} joints${bad ? ` · ${bad} to check` : ''}`;
}

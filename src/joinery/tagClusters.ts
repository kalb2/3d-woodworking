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

/**
 * Is a screen point under app UI (a sheet, bar, floating button, modal)?
 * `stack` is document.elementsFromPoint, topmost first. Anything inside the 3D view
 * (`root`, which holds the tags themselves) means the point is open; see-through
 * backdrops are skipped; anything else covers it.
 */
export function pointCovered(stack: Element[], root: Element, passThrough: (el: Element) => boolean): boolean {
  for (const el of stack) {
    if (root.contains(el)) return false;
    if (passThrough(el)) continue;
    return true;
  }
  return false;
}

/** Sample points of a tag box (centre + inset corners), in the same coordinates as the box. */
export function boxSamples(b: { x: number; y: number; w: number; h: number }, inset = 3): [number, number][] {
  const dx = Math.max(0, b.w / 2 - inset), dy = Math.max(0, b.h / 2 - inset);
  return [[b.x, b.y], [b.x - dx, b.y - dy], [b.x + dx, b.y - dy], [b.x - dx, b.y + dy], [b.x + dx, b.y + dy]];
}

/** A tag hides when any part of it would sit under app UI (no half-tucked tags peeking over a sheet edge). */
export const boxCovered = (b: { x: number; y: number; w: number; h: number }, covered: (x: number, y: number) => boolean) =>
  boxSamples(b).some(([x, y]) => covered(x, y));

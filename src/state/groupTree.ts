import type { FurnitureObject, WoodMaterial } from '../types/furniture';

/**
 * Nested groups: a group is an object with shape 'group'; members point at it
 * with parentId (any depth). Every object keeps world-space position/rotation,
 * so rendering stays flat; a group's own box is the bounds of its members.
 * All helpers are pure.
 */

const isGroup = (o: FurnitureObject | undefined) => o?.shape === 'group';

export function childrenOf(objects: FurnitureObject[], id: string | null): FurnitureObject[] {
  return objects.filter((o) => (o.parentId ?? null) === id);
}

/** All ids below `id` (not including it), depth first. */
export function descendantIds(objects: FurnitureObject[], id: string): string[] {
  const byParent = new Map<string, FurnitureObject[]>();
  for (const o of objects) if (o.parentId) {
    const list = byParent.get(o.parentId) ?? [];
    list.push(o);
    byParent.set(o.parentId, list);
  }
  const out: string[] = [];
  const seen = new Set<string>([id]);
  const walk = (pid: string) => {
    for (const c of byParent.get(pid) ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c.id);
      walk(c.id);
    }
  };
  walk(id);
  return out;
}

/** Ancestor chain, nearest parent first. */
export function ancestorIds(objects: FurnitureObject[], id: string): string[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const out: string[] = [];
  let cur = byId.get(id)?.parentId;
  while (cur && !out.includes(cur) && byId.has(cur)) {
    out.push(cur);
    cur = byId.get(cur)?.parentId;
  }
  return out;
}

/** Path from top level down to `id` (inclusive), for breadcrumbs. */
export function pathTo(objects: FurnitureObject[], id: string | null): string[] {
  if (!id) return [];
  return [...ancestorIds(objects, id).reverse(), id];
}

/**
 * What a tap on `id` selects within `context` (null = top level): the
 * ancestor-or-self whose parent is the context. Null when `id` is outside it.
 */
export function topUnder(objects: FurnitureObject[], id: string, context: string | null): string | null {
  const chain = [id, ...ancestorIds(objects, id)];
  const byId = new Map(objects.map((o) => [o.id, o]));
  for (const cid of chain) {
    if ((byId.get(cid)?.parentId ?? null) === context) return cid;
  }
  return null;
}

/** Leaf (non-group) objects under an id, or the object itself if a part. */
export function leavesOf(objects: FurnitureObject[], id: string): FurnitureObject[] {
  const self = objects.find((o) => o.id === id);
  if (!self) return [];
  if (!isGroup(self)) return [self];
  const ids = new Set(descendantIds(objects, id));
  return objects.filter((o) => ids.has(o.id) && !isGroup(o));
}

export interface Box { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }

/** World AABB of a (possibly rotated) box object. */
export function objectBox(o: FurnitureObject): Box {
  const hx = o.dimensions.length / 2, hy = o.dimensions.height / 2, hz = o.dimensions.width / 2;
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const c of boxCorners(o)) {
    min.x = Math.min(min.x, c.x); min.y = Math.min(min.y, c.y); min.z = Math.min(min.z, c.z);
    max.x = Math.max(max.x, c.x); max.y = Math.max(max.y, c.y); max.z = Math.max(max.z, c.z);
  }
  if (!Number.isFinite(min.x)) return { min: { x: o.position.x - hx, y: o.position.y - hy, z: o.position.z - hz }, max: { x: o.position.x + hx, y: o.position.y + hy, z: o.position.z + hz } };
  return { min, max };
}

/** The 8 world corners of an object's box (Euler XYZ, degrees, like three.js). */
export function boxCorners(o: FurnitureObject): { x: number; y: number; z: number }[] {
  const hx = o.dimensions.length / 2, hy = o.dimensions.height / 2, hz = o.dimensions.width / 2;
  const rad = Math.PI / 180;
  const [a, b, c] = [o.rotation.x * rad, o.rotation.y * rad, o.rotation.z * rad];
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // three.js Euler 'XYZ' matrix = Rx * Ry * Rz
  const m = [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
  const out = [];
  for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [-hz, hz]) {
    out.push({
      x: o.position.x + m[0][0] * x + m[0][1] * y + m[0][2] * z,
      y: o.position.y + m[1][0] * x + m[1][1] * y + m[1][2] * z,
      z: o.position.z + m[2][0] * x + m[2][1] * y + m[2][2] * z,
    });
  }
  return out;
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const b of boxes) {
    min.x = Math.min(min.x, b.min.x); min.y = Math.min(min.y, b.min.y); min.z = Math.min(min.z, b.min.z);
    max.x = Math.max(max.x, b.max.x); max.y = Math.max(max.y, b.max.y); max.z = Math.max(max.z, b.max.z);
  }
  return { min, max };
}

/** Axis-aligned group box around a set of leaves. */
function fitTo(group: FurnitureObject, leaves: FurnitureObject[]): FurnitureObject {
  const b = unionBox(leaves.map(objectBox));
  if (!b) return group;
  return {
    ...group,
    position: { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 },
    dimensions: { length: Math.max(b.max.x - b.min.x, 0.5), height: Math.max(b.max.y - b.min.y, 0.5), width: Math.max(b.max.z - b.min.z, 0.5) },
    rotation: { x: 0, y: 0, z: 0 },
  };
}

/**
 * Re-fit the boxes of the given groups (and all their ancestors) to their
 * contents. Rotated groups (e.g. wall-fitted built-ins) keep their own box.
 * Groups left empty are removed.
 */
export function refitGroups(objects: FurnitureObject[], groupIds: Iterable<string>): FurnitureObject[] {
  const targets = new Set<string>();
  for (const id of groupIds) {
    targets.add(id);
    for (const a of ancestorIds(objects, id)) targets.add(a);
  }
  let out = objects;
  // Deepest first so parents see refit children (boxes come from leaves anyway).
  const order = [...targets].sort((a, b) => ancestorIds(objects, b).length - ancestorIds(objects, a).length);
  for (const id of order) {
    const g = out.find((o) => o.id === id);
    if (!g || !isGroup(g)) continue;
    const leaves = leavesOf(out, id);
    if (leaves.length === 0 && childrenOf(out, id).length === 0) {
      out = out.filter((o) => o.id !== id);
      continue;
    }
    if (g.rotation.x || g.rotation.y || g.rotation.z) continue;
    const fitted = fitTo(g, leaves);
    out = out.map((o) => (o.id === id ? fitted : o));
  }
  return out;
}

export function newGroupId(stamp = Date.now()) {
  return `grp_${stamp}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Wrap `ids` (siblings in `context`) in a new group, nested inside the
 * context. Ids outside the context are lifted to their ancestor in it.
 */
export function groupIds(
  objects: FurnitureObject[],
  ids: string[],
  context: string | null,
  material: WoodMaterial,
  groupId = newGroupId(),
  name = 'Group',
): { objects: FurnitureObject[]; groupId: string } | null {
  const members = new Set<string>();
  for (const id of ids) {
    const top = topUnder(objects, id, context);
    const o = top ? objects.find((x) => x.id === top) : undefined;
    if (!o || o.generator === 'room-scan') continue;
    members.add(o.id);
  }
  if (members.size < 2) return null;
  const leaves = [...members].flatMap((id) => leavesOf(objects, id));
  const base: FurnitureObject = {
    id: groupId,
    name,
    shape: 'group',
    dimensions: { length: 1, height: 1, width: 1 },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    material,
    visible: true,
    ...(context ? { parentId: context } : {}),
  };
  const group = fitTo(base, leaves);
  const next = objects.map((o) => (members.has(o.id) ? { ...o, parentId: groupId } : o));
  return { objects: refitGroups([...next, group], context ? [context] : []), groupId };
}

/** Remove one level: children move up to the group's parent. */
export function ungroupOne(objects: FurnitureObject[], id: string): { objects: FurnitureObject[]; childIds: string[] } | null {
  const g = objects.find((o) => o.id === id);
  if (!g || !isGroup(g)) return null;
  const childIds = childrenOf(objects, id).map((o) => o.id);
  const biId = g.builtIn?.id;
  const below = biId ? new Set(descendantIds(objects, id)) : null;
  const out = objects
    .filter((o) => o.id !== id)
    .map((o) => {
      let n = o;
      if (o.parentId === id) {
        const { parentId: _p, ...rest } = n;
        void _p;
        n = g.parentId ? { ...rest, parentId: g.parentId } : rest;
      }
      // An ungrouped built-in stops being a built-in; its parts become plain parts.
      if (below?.has(o.id) && o.builtInId === biId) {
        const { builtInId: _b, ...rest } = n;
        void _b;
        n = rest;
      }
      return n;
    });
  return { objects: g.parentId ? refitGroups(out, [g.parentId]) : out, childIds };
}

/** Delete ids and everything under them; refit surviving parent groups. */
export function deleteCascade(objects: FurnitureObject[], ids: string[]): FurnitureObject[] {
  const gone = new Set<string>();
  const parents = new Set<string>();
  for (const id of ids) {
    const o = objects.find((x) => x.id === id);
    if (!o) continue;
    gone.add(id);
    for (const d of descendantIds(objects, id)) gone.add(d);
    if (o.parentId) parents.add(o.parentId);
  }
  const out = objects.filter((o) => !gone.has(o.id));
  return refitGroups(out, [...parents].filter((p) => !gone.has(p)));
}

/**
 * Deep-copy ids (with everything below) with fresh ids, offset in x/z.
 * Copies stay in the same parent. Built-in copies get a new instance id.
 */
export function deepDuplicate(
  objects: FurnitureObject[],
  ids: string[],
  offset = { x: 4, y: 0, z: 4 },
  stamp = Date.now(),
): { objects: FurnitureObject[]; topIds: string[] } {
  const rnd = () => Math.random().toString(36).slice(2, 6);
  const idMap = new Map<string, string>();
  const biMap = new Map<string, string>();
  const tops = ids.filter((id) => objects.some((o) => o.id === id) && !ancestorIds(objects, id).some((a) => ids.includes(a)));
  const all: string[] = [];
  for (const id of tops) { all.push(id, ...descendantIds(objects, id)); }
  let n = 0;
  for (const id of all) idMap.set(id, `obj_${stamp}_${n++}_${rnd()}`);
  const copies: FurnitureObject[] = [];
  for (const id of all) {
    const o = objects.find((x) => x.id === id)!;
    const copy: FurnitureObject = JSON.parse(JSON.stringify(o));
    copy.id = idMap.get(id)!;
    if (o.parentId && idMap.has(o.parentId)) copy.parentId = idMap.get(o.parentId);
    copy.position = { x: o.position.x + offset.x, y: o.position.y + offset.y, z: o.position.z + offset.z };
    if (tops.includes(id)) copy.name = `${o.name} Copy`;
    if (o.builtIn) {
      const nb = biMap.get(o.builtIn.id) ?? `bi_${stamp}_${rnd()}`;
      biMap.set(o.builtIn.id, nb);
      copy.builtIn = { ...o.builtIn, id: nb };
    }
    copies.push(copy);
  }
  // Parts of a copied built-in point at the copy's instance id.
  for (const c of copies) if (c.builtInId && biMap.has(c.builtInId)) c.builtInId = biMap.get(c.builtInId);
  const parents = new Set(tops.map((id) => objects.find((o) => o.id === id)?.parentId).filter(Boolean) as string[]);
  return { objects: refitGroups([...objects, ...copies], parents), topIds: tops.map((id) => idMap.get(id)!) };
}

/** Ids moved together when `id` moves: itself and everything below. */
export function moveSet(objects: FurnitureObject[], id: string): Set<string> {
  return new Set([id, ...descendantIds(objects, id)]);
}

/**
 * Load-time cleanup / migration: drop parentIds that point at missing or
 * non-group objects and break cycles. One-level groups from older projects
 * are already valid nested groups.
 */
export function normalizeTree(objects: FurnitureObject[]): FurnitureObject[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  let changed = false;
  const out = objects.map((o) => {
    if (!o.parentId) return o;
    const p = byId.get(o.parentId);
    let bad = !p || p.shape !== 'group' || o.parentId === o.id;
    if (!bad) {
      const seen = new Set([o.id]);
      let cur: string | undefined = o.parentId;
      while (cur) {
        if (seen.has(cur)) { bad = true; break; }
        seen.add(cur);
        cur = byId.get(cur)?.parentId;
      }
    }
    if (!bad) return o;
    changed = true;
    const { parentId: _p, ...rest } = o;
    void _p;
    return rest;
  });
  return changed ? out : objects;
}

/* ---------- area select ---------- */

export interface ScreenRect { x0: number; y0: number; x1: number; y1: number }

export const normRect = (r: ScreenRect): ScreenRect => ({
  x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1),
});

export function rectsIntersect(a: ScreenRect, b: ScreenRect): boolean {
  const A = normRect(a), B = normRect(b);
  return A.x0 <= B.x1 && B.x0 <= A.x1 && A.y0 <= B.y1 && B.y0 <= A.y1;
}

/**
 * Ids (in `context`) whose projected bounds intersect the drag rectangle.
 * `project` maps a world point to screen px, or null when behind the camera.
 * Locked scanned walls are skipped.
 */
export function areaSelect(
  objects: FurnitureObject[],
  context: string | null,
  rect: ScreenRect,
  project: (p: { x: number; y: number; z: number }) => { x: number; y: number } | null,
  roomLocked = true,
): string[] {
  const out: string[] = [];
  for (const o of childrenOf(objects, context)) {
    if (o.visible === false) continue;
    if (o.generator === 'room-scan' && roomLocked) continue;
    const corners = (isGroup(o) ? leavesOf(objects, o.id) : [o]).flatMap(boxCorners);
    const pts = corners.map(project).filter(Boolean) as { x: number; y: number }[];
    if (!pts.length) continue;
    const s: ScreenRect = {
      x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)),
      x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)),
    };
    if (rectsIntersect(s, rect)) out.push(o.id);
  }
  return out;
}

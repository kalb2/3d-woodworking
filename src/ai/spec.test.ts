import { describe, expect, it } from 'vitest';
import { extractJson, parseSpec, SPEC_SCHEMA, SYSTEM_PROMPT, userMessage } from './spec';

describe('parseSpec', () => {
  it('reads a template reference and coerces numeric strings', () => {
    const r = parseSpec({ kind: 'template', name: 'Shelf', template: 'bookshelf', params: { width: '36', height: 72, shelves: 4, material: 'Oak' } });
    expect(r).toEqual({ ok: true, spec: { kind: 'template', name: 'Shelf', template: 'bookshelf', params: { width: 36, height: 72, shelves: 4, material: 'oak' } } });
  });

  it('rejects unknown templates and non-numeric params', () => {
    expect(parseSpec({ kind: 'template', template: 'media-wall' }).ok).toBe(false);
    expect(parseSpec({ kind: 'template', template: 'bookshelf', params: { width: 'wide' } })).toEqual({ ok: false, error: 'params.width must be a number.' });
  });

  it('reads boards: lumber, sheet defaults, missing rotation, "2×4" spelling', () => {
    const r = parseSpec({
      kind: 'boards', name: 'Bench',
      boards: [
        { name: 'Leg', stock: '2×4', length: 17.25, x: 0, y: 0, z: 0, rotation: { z: 90 } },
        { name: 'Top', stock: 'sheet', length: 48, width: 16, x: 0, y: 17.25, z: 0 },
      ],
      joints: [{ type: 'pocket', a: 0, b: 1 }, { type: 'glue', a: 0, b: 1 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.spec.kind !== 'boards') return;
    expect(r.spec.boards[0]).toMatchObject({ stock: '2x4', rotation: { x: 0, y: 0, z: 90 } });
    expect(r.spec.boards[1]).toMatchObject({ material: 'plywood', thickness: 0.75, width: 16 });
    expect(r.spec.joints).toEqual([{ type: 'pocket', a: 0, b: 1 }]);
  });

  it('needs width for sheet goods, a known stock and sane lengths', () => {
    expect(parseSpec({ kind: 'boards', boards: [{ name: 'P', stock: 'sheet', length: 10, x: 0, y: 0, z: 0 }] }).ok).toBe(false);
    expect(parseSpec({ kind: 'boards', boards: [{ name: 'P', stock: '4x4', length: 10, x: 0, y: 0, z: 0 }] }).ok).toBe(false);
    expect(parseSpec({ kind: 'boards', boards: [{ name: 'P', stock: '2x4', length: -1, x: 0, y: 0, z: 0 }] }).ok).toBe(false);
    expect(parseSpec({ kind: 'boards', boards: [] }).ok).toBe(false);
    expect(parseSpec({ kind: 'chair' }).ok).toBe(false);
  });

  it('caps the board count', () => {
    const boards = Array.from({ length: 61 }, () => ({ name: 'B', stock: '1x2', length: 10, x: 0, y: 0, z: 0 }));
    expect(parseSpec({ kind: 'boards', boards })).toEqual({ ok: false, error: 'At most 60 boards.' });
  });

  it('pulls JSON out of fenced or chatty replies', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":2} Hope that helps')).toEqual({ a: 2 });
    expect(() => extractJson('no json here')).toThrow();
    expect(parseSpec('not json').ok).toBe(false);
    expect(parseSpec('{"kind":"template","name":"B","template":"bookshelf"}').ok).toBe(true);
  });

  it('prompt and schema cover both shapes; changes send the current design', () => {
    expect(SYSTEM_PROMPT).toContain('"kind":"template"');
    expect(SYSTEM_PROMPT).toContain('"kind":"boards"');
    expect(SPEC_SCHEMA.properties.kind.enum).toEqual(['template', 'boards']);
    expect(userMessage('a bench')).toBe('Design: a bench');
    expect(userMessage('taller', { kind: 'template', name: 'B', template: 'bookshelf', params: {} })).toContain('Change: taller');
  });
});

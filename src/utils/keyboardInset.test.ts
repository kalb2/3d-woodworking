import { describe, expect, it } from 'vitest';
import { keyboardOverlap } from './keyboardInset';

describe('keyboard overlap', () => {
  it('is the gap the software keyboard covers, and zero when the viewport is full', () => {
    expect(keyboardOverlap(800, 800, 0)).toBe(0);
    expect(keyboardOverlap(800, 430, 0)).toBe(370);
    expect(keyboardOverlap(800, 500, 20)).toBe(280);
    expect(keyboardOverlap(800, 900, 0)).toBe(0);
    expect(keyboardOverlap(Number.NaN, 100, 0)).toBe(0);
  });
});

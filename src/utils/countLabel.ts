/** "1 part", "2 parts", "0 parts": a count with its noun pluralized correctly. */
export function countLabel(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

let fallbackSeq = 0;

/**
 * A random token that won't collide: crypto.randomUUID where it exists,
 * else 128 random bits from getRandomValues, else time + counter + Math.random.
 */
export function randomToken(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  fallbackSeq += 1;
  return `${Date.now().toString(36)}${fallbackSeq.toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/** `obj_<uuid>`, `proj_<uuid>`, ... */
export function newId(prefix: string): string {
  return `${prefix}_${randomToken()}`;
}

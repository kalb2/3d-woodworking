const ITERATIONS = 100_000;
const SCHEME = 'pbkdf2';

function encode(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function sameBytes(left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

/** PBKDF2-SHA256. The stored string never includes the password. */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(salt);
  const hash = await derive(password, salt, ITERATIONS);
  return `${SCHEME}$${ITERATIONS}$${encode(salt)}$${encode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsText, saltText, hashText] = stored.split('$');
  if (scheme !== SCHEME || !iterationsText || !saltText || !hashText) return false;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 1_000_000) return false;
  const actual = await derive(password, decode(saltText), iterations);
  return sameBytes(actual, decode(hashText));
}

/** Lowercase username, or an error message. */
export function normalizeUsername(raw: string): string | { error: string } {
  const username = raw.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(username)) {
    return { error: 'Use 3–32 characters: a letter, then letters, numbers, or underscores.' };
  }
  return username;
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 200) return 'That password is too long.';
  return null;
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;
(globalThis as unknown as { window: unknown }).window ??= globalThis;

const deleteAccountRequest = vi.fn(async (_token: string, _code?: string) => ({ deleted: true, message: 'Deleted.' }));
const authorizeWithApple = vi.fn(async () => ({ identityToken: 'id', authorizationCode: 'code-1' }));
let appleAvailable = true;

vi.mock('../sync/client.ts', async (orig) => ({
  ...(await orig<typeof import('../sync/client.ts')>()),
  deleteAccountRequest: (token: string, code?: string) => deleteAccountRequest(token, code),
}));
vi.mock('../sync/appleSignIn.ts', async (orig) => ({
  ...(await orig<typeof import('../sync/appleSignIn.ts')>()),
  appleSignInAvailable: () => appleAvailable,
  authorizeWithApple: () => authorizeWithApple(),
}));

const { useAccountStore } = await import('./useAccountStore');
const signIn = (provider: 'apple' | 'password') => useAccountStore.setState({
  token: 't', status: 'signed-in', account: { id: 'acct', provider, appleSub: 'sub', email: '', username: '', displayName: 'K', createdAt: 1 },
});

describe('delete account', () => {
  beforeEach(() => { deleteAccountRequest.mockClear(); authorizeWithApple.mockClear(); appleAvailable = true; });

  it('Apple accounts confirm with Apple and send the authorization code for revocation', async () => {
    signIn('apple');
    await useAccountStore.getState().deleteAccount();
    expect(authorizeWithApple).toHaveBeenCalledTimes(1);
    expect(deleteAccountRequest).toHaveBeenCalledWith('t', 'code-1');
    expect(useAccountStore.getState()).toMatchObject({ status: 'signed-out', account: null, notice: 'Deleted.' });
  });

  it('cancelling the Apple sheet keeps the account', async () => {
    signIn('apple');
    authorizeWithApple.mockRejectedValueOnce(new Error('The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)'));
    await useAccountStore.getState().deleteAccount();
    expect(deleteAccountRequest).not.toHaveBeenCalled();
    expect(useAccountStore.getState()).toMatchObject({ status: 'signed-in', syncStatus: 'idle' });
    expect(useAccountStore.getState().notice).toMatch(/not deleted/);
  });

  it('an Apple sheet failure still deletes (without revocation)', async () => {
    signIn('apple');
    authorizeWithApple.mockRejectedValueOnce(new Error('Apple did not return an identity token.'));
    await useAccountStore.getState().deleteAccount();
    expect(deleteAccountRequest).toHaveBeenCalledWith('t', undefined);
    expect(useAccountStore.getState().status).toBe('signed-out');
  });

  it('username accounts delete without the Apple sheet', async () => {
    signIn('password');
    await useAccountStore.getState().deleteAccount();
    expect(authorizeWithApple).not.toHaveBeenCalled();
    expect(deleteAccountRequest).toHaveBeenCalledWith('t', undefined);
  });
});

import React, { useEffect, useRef, useState } from 'react';
import { Cloud, LogOut, RefreshCw, User } from 'lucide-react';
import { SYNC_SERVER_UNCONFIGURED } from '../../sync/client';
import { appleSignInUnavailableReason } from '../../sync/appleSignIn';
import { useAccountStore } from '../../state/useAccountStore';
import { useAppStore } from '../../state/useAppStore';
import type { Account } from '../../sync/types';

function formatSynced(at: number | null) {
  if (!at) return 'Not synced yet';
  return `Last synced ${new Date(at).toLocaleString()}`;
}

function accountLabel(account: Account) {
  return account.username || account.email || account.displayName;
}

function providerLabel(provider: Account['provider']) {
  if (provider === 'apple') return 'Apple';
  if (provider === 'password') return 'Username';
  return 'Dev';
}

export const AccountSyncStrip: React.FC = () => {
  const status = useAccountStore((state) => state.status);
  const account = useAccountStore((state) => state.account);
  const syncStatus = useAccountStore((state) => state.syncStatus);
  const lastError = useAccountStore((state) => state.lastError);
  const migration = useAccountStore((state) => state.migration);
  const setHomeTab = useAppStore((state) => state.setHomeTab);
  const openProfile = () => setHomeTab('profile');
  const label = account ? accountLabel(account) : '';

  let detail = 'On this device only';
  if (status === 'loading') detail = 'Checking account…';
  else if (status === 'signed-in') {
    if (syncStatus === 'syncing') detail = `Syncing ${label || 'your account'}…`;
    else if (syncStatus === 'error' || syncStatus === 'offline') detail = lastError || 'Sync needs attention';
    else if (migration === 'needed') detail = `Signed in as ${label}. Save this device to the account from Profile.`;
    else if (migration === 'skipped') detail = `Signed in as ${label}. This device is not uploading yet.`;
    else detail = `Synced to ${label}`;
  }

  return (
    <button
      type="button"
      className="account-sync-strip"
      data-testid="account-sync-strip"
      onClick={openProfile}
    >
      <Cloud size={16} />
      <span>{detail}</span>
    </button>
  );
};

export const ProfilePanel: React.FC = () => {
  const {
    status,
    account,
    config,
    syncStatus,
    lastSyncedAt,
    lastError,
    notice,
    serverConfigured,
    appleAvailable,
    migration,
    loadSession,
    signInApple,
    signUp,
    signInPassword,
    signOut,
    deleteAccount,
    saveAndSync,
    skipMigration,
    syncNow,
  } = useAccountStore();
  const formRef = useRef<HTMLFormElement>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const appleHint = appleSignInUnavailableReason();

  const busy = syncStatus === 'syncing';
  const formLocked = busy || !serverConfigured;

  useEffect(() => {
    if (status === 'signed-in') {
      setUsername('');
      setPassword('');
    }
  }, [status]);

  function submitAccount(action: (username: string, password: string) => Promise<void>) {
    if (formRef.current && !formRef.current.reportValidity()) return;
    void action(username, password);
  }

  return (
    <div className="profile-panel" data-testid="profile-panel">
      <div className="profile-card">
        <div className="profile-heading">
          <span className="profile-avatar"><User size={22} /></span>
          <div>
            <h3>Profile</h3>
            <p>A username keeps projects on this account across iPhone and iPad.</p>
          </div>
        </div>

        {status === 'loading' && <p className="profile-note">Checking your account…</p>}

        {!serverConfigured && (
          <p className="profile-note" data-testid="sync-unconfigured">
            {SYNC_SERVER_UNCONFIGURED}
          </p>
        )}

        {notice && <p className="profile-note" data-testid="profile-notice">{notice}</p>}
        {lastError && <p className="profile-error" data-testid="profile-error">{lastError}</p>}

        {status === 'signed-out' && (
          <div className="profile-stack">
            <form
              ref={formRef}
              className="profile-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitAccount(signUp);
              }}
            >
              <label>
                Username
                <input
                  data-testid="account-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  pattern="[A-Za-z][A-Za-z0-9_]{2,31}"
                  title="Use 3–32 characters: a letter, then letters, numbers, or underscores."
                  required
                  disabled={formLocked}
                />
              </label>
              <label>
                Password
                <input
                  data-testid="account-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  minLength={8}
                  required
                  disabled={formLocked}
                />
              </label>
              <div className="profile-actions">
                <button
                  type="submit"
                  className="glass-button active"
                  data-testid="account-create"
                  disabled={formLocked}
                >
                  <span>Create account</span>
                </button>
                <button
                  type="button"
                  className="glass-button"
                  data-testid="account-sign-in"
                  disabled={formLocked}
                  onClick={() => submitAccount(signInPassword)}
                >
                  <span>Sign in</span>
                </button>
              </div>
            </form>
            <p className="profile-note">Or</p>
            <button
              type="button"
              className="glass-button"
              data-testid="sign-in-apple"
              disabled={formLocked}
              onClick={() => { void signInApple(); }}
            >
              <span>Sign in with Apple</span>
            </button>
            {!appleAvailable && appleHint && (
              <p className="profile-note" data-testid="apple-hint">{appleHint}</p>
            )}
            {serverConfigured && !config && (
              <button type="button" className="glass-button" onClick={() => { void loadSession(); }}>
                <RefreshCw size={16} />
                <span>Try again</span>
              </button>
            )}
          </div>
        )}

        {status === 'signed-in' && account && (
          <div className="profile-stack">
            <div className="profile-identity">
              <strong data-testid="profile-name">{account.displayName}</strong>
              <span data-testid="profile-email">{accountLabel(account)}</span>
              <span className="profile-badge" data-testid="profile-provider">{providerLabel(account.provider)}</span>
            </div>
            <p className="profile-note">
              {config?.mode === 'cloud' ? 'Cloud sync' : 'Saved to your account'}
              {' · '}
              {syncStatus === 'syncing' ? 'Syncing…' : formatSynced(lastSyncedAt)}
            </p>

            {migration === 'needed' && (
              <div className="profile-migration" data-testid="migration-prompt">
                <strong>Save this device to your account?</strong>
                <p>
                  Projects already on this iPhone or iPad can upload now. The starter layout gets its own id so two devices do not overwrite each other. Newer edits win.
                </p>
                <div className="profile-actions">
                  <button
                    type="button"
                    className="glass-button active"
                    data-testid="migration-save"
                    disabled={busy}
                    onClick={() => { void saveAndSync(); }}
                  >
                    <span>Save and sync</span>
                  </button>
                  <button
                    type="button"
                    className="glass-button"
                    data-testid="migration-skip"
                    disabled={busy}
                    onClick={skipMigration}
                  >
                    <span>Not now</span>
                  </button>
                </div>
              </div>
            )}

            <div className="profile-actions">
              {migration !== 'needed' && (
                <button
                  type="button"
                  className="glass-button"
                  data-testid="profile-sync-now"
                  disabled={busy}
                  onClick={() => { void syncNow(); }}
                >
                  <RefreshCw size={16} />
                  <span>Sync now</span>
                </button>
              )}
              <button
                type="button"
                className="glass-button"
                data-testid="profile-sign-out"
                disabled={busy}
                onClick={() => { void signOut(); }}
              >
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            </div>

            <div className="profile-danger">
              <strong>Delete Workbench account</strong>
              <p>
                {account.provider === 'apple'
                  ? 'This deletes cloud projects and sessions for this Workbench account. Your Apple ID stays in iOS Settings. Projects already saved on this device stay until you delete them in the app.'
                  : 'This deletes cloud projects and sessions for this username. Projects already saved on this device stay until you delete them in the app.'}
              </p>
              {confirmDelete ? (
                <div className="profile-actions">
                  <button
                    type="button"
                    className="glass-button profile-delete"
                    data-testid="profile-delete"
                    disabled={busy}
                    onClick={() => { void deleteAccount(); }}
                  >
                    <span>Delete cloud account</span>
                  </button>
                  <button type="button" className="glass-button" onClick={() => setConfirmDelete(false)}>
                    <span>Cancel</span>
                  </button>
                </div>
              ) : (
                <button type="button" className="glass-button" onClick={() => setConfirmDelete(true)}>
                  <span>Delete account…</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

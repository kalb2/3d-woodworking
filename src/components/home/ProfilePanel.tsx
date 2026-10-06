import React, { useState } from 'react';
import { Cloud, LogOut, RefreshCw, User } from 'lucide-react';
import { SYNC_SERVER_UNCONFIGURED } from '../../sync/client';
import { appleSignInUnavailableReason } from '../../sync/appleSignIn';
import { useAccountStore } from '../../state/useAccountStore';
import { useAppStore } from '../../state/useAppStore';

function formatSynced(at: number | null) {
  if (!at) return 'Not synced yet';
  return `Last synced ${new Date(at).toLocaleString()}`;
}

export const AccountSyncStrip: React.FC = () => {
  const status = useAccountStore((state) => state.status);
  const account = useAccountStore((state) => state.account);
  const syncStatus = useAccountStore((state) => state.syncStatus);
  const lastError = useAccountStore((state) => state.lastError);
  const migration = useAccountStore((state) => state.migration);
  const setHomeTab = useAppStore((state) => state.setHomeTab);
  const openProfile = () => setHomeTab('profile');
  const email = account?.email;

  let detail = 'On this device only';
  if (status === 'loading') detail = 'Checking account…';
  else if (status === 'signed-in') {
    if (syncStatus === 'syncing') detail = `Syncing ${email ?? 'your account'}…`;
    else if (syncStatus === 'error' || syncStatus === 'offline') detail = lastError || 'Sync needs attention';
    else if (migration === 'needed') detail = `Signed in as ${email}. Save this device to the account from Profile.`;
    else if (migration === 'skipped') detail = `Signed in as ${email}. This device is not uploading yet.`;
    else detail = `Synced to ${email}`;
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
    signInDev,
    signOut,
    deleteAccount,
    saveAndSync,
    skipMigration,
    syncNow,
  } = useAccountStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const appleHint = appleSignInUnavailableReason();

  const busy = syncStatus === 'syncing';

  return (
    <div className="profile-panel" data-testid="profile-panel">
      <div className="profile-card">
        <div className="profile-heading">
          <span className="profile-avatar"><User size={22} /></span>
          <div>
            <h3>Profile</h3>
            <p>Sign in with Apple to keep projects on this account across iPhone and iPad.</p>
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
            <button
              type="button"
              className="glass-button active"
              data-testid="sign-in-apple"
              disabled={busy}
              onClick={() => { void signInApple(); }}
            >
              <span>Sign in with Apple</span>
            </button>
            {!appleAvailable && appleHint && (
              <p className="profile-note">{appleHint}</p>
            )}
            {!config && (
              <button type="button" className="glass-button" onClick={() => { void loadSession(); }}>
                <RefreshCw size={16} />
                <span>Retry sync server</span>
              </button>
            )}
            {config?.devSignIn && (
              <form
                className="profile-dev"
                onSubmit={(event) => {
                  event.preventDefault();
                  void signInDev(name, email);
                }}
              >
                <strong>Dev sign-in</strong>
                <p>Same email on two devices joins one account. This path is only on the local sync server.</p>
                <label>
                  Display name
                  <input
                    data-testid="dev-sign-in-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    data-testid="dev-sign-in-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </label>
                <button type="submit" className="glass-button" data-testid="dev-sign-in-submit" disabled={busy}>
                  <span>Continue</span>
                </button>
              </form>
            )}
          </div>
        )}

        {status === 'signed-in' && account && (
          <div className="profile-stack">
            <div className="profile-identity">
              <strong data-testid="profile-name">{account.displayName}</strong>
              <span data-testid="profile-email">{account.email}</span>
              <span className="profile-badge">{account.provider === 'apple' ? 'Apple' : 'Dev'}</span>
            </div>
            <p className="profile-note">
              {config?.mode === 'cloud' ? 'Cloud sync' : 'Dev sync on this computer'}
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
                This deletes cloud projects and sessions for this Workbench account. Your Apple ID is not deleted — that stays in iOS Settings. Projects already saved on this device stay until you delete them in the app.
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

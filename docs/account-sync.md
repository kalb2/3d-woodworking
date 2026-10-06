# Account and project sync

Projects stay in `localStorage` (`ipad_3d_furniture_projects_v1`) and sync to a Workbench account. The production API is a Cloudflare Worker with D1. The Vite dev server implements the same routes against `.data/sync-dev.json`, so two browsers or devices on one dev server share an account without Apple or Cloudflare secrets.

Conflict rule: last write wins per project `updatedAt`. A delete is a tombstone (`deletedAt`) so an older copy does not come back. The seeded starter id `proj_default` is rewritten once, on the first upload, so two devices do not clobber the same starter.

First sign-in asks **Save and sync** or **Not now**. Nothing uploads until you choose. **Sync now** uploads and turns ongoing sync on. After that, edits debounce to the account, and returning to the app syncs again.

Sign-out keeps the on-device cache. **Delete account** removes Workbench cloud rows and sessions only. It does not delete the Apple ID. Local projects remain until you delete them in the app.

## API

Prefix: `/api/v1`

| Method | Path | Body | Auth |
| --- | --- | --- | --- |
| GET | `/auth/config` | — | no |
| POST | `/auth/apple` | `{ identityToken, email?, displayName? }` | no |
| POST | `/auth/signout` | — | bearer |
| GET | `/me` | — | bearer |
| DELETE | `/me` | — | bearer |
| GET | `/projects` | — | bearer |
| PUT | `/projects` | `{ records }` | bearer |

`GET /auth/config` returns `{ devSignIn, mode, appleAudience }`. `mode` is `dev` on Vite and `cloud` on the Worker. Apple identity tokens are verified with Apple’s JWKS (RS256, issuer `https://appleid.apple.com`, audience `com.antigravity.furniture3d`). No Apple client secret is required. Dev tokens are `dev.` plus base64url JSON `{ email, displayName }` and are accepted only when dev sign-in is on. The same email maps to one account (`appleSub` `dev:<email>`).

## Environment

| Name | Where | Purpose |
| --- | --- | --- |
| `VITE_SYNC_API_URL` | app build | Worker origin, no trailing slash. Empty uses the same origin, which is correct for `npm run dev`. A Capacitor build (`capacitor://localhost`) must set this to the deployed Worker or it cannot reach Vite. |
| `ALLOW_DEV_AUTH` | Worker secret | Set to `1` only on a private dev Worker. Production should omit it so only Apple tokens work. |
| `APPLE_AUDIENCE` | Worker secret, optional | Defaults to `com.antigravity.furniture3d`. |
| D1 binding `DB` | `worker/wrangler.toml` | Database name `workbench`. Replace the placeholder `database_id`. |

Dev data file `.data/sync-dev.json` is gitignored.

## Two-device smoke test (no secrets)

1. `npm run dev:host`
2. On both devices, open `http://<this-machine-lan-ip>:5173`
3. Profile → Dev sign-in with the **same email** on both
4. On each device, tap **Save and sync**
5. Rename a project on one device, wait a moment (or tap **Sync now**), then reopen the app or tap **Sync now** on the other

The shared file is `.data/sync-dev.json`. Two browser profiles against `http://127.0.0.1:5173` exercise the same path.

## Worker deploy (when credentials exist)

```sh
npx wrangler d1 create workbench
# paste the database_id into worker/wrangler.toml
npx wrangler d1 execute workbench --file=worker/schema.sql
npx wrangler deploy
```

Run those from a Wrangler install (`npx wrangler`); Wrangler is not a package dependency yet. Set `VITE_SYNC_API_URL` to the Worker origin for iOS builds.

## Sign in with Apple on device

The App ID `com.antigravity.furniture3d` has Sign in with Apple enabled. The iOS target uses that bundle id, `@capacitor-community/apple-sign-in`, and `ios/App/App/App.entitlements` (`com.apple.developer.applesignin` = Default). Profile is the person icon at the top right of Home and the editor. On iOS it calls `SignInWithApple.authorize`. The browser still uses dev sign-in; Apple’s web JS flow is not configured.

A native build with no `VITE_SYNC_API_URL` does not call `/api/v1` on `capacitor://localhost`. Profile stays signed out and says the sync server is not configured. A non-JSON response is shown as that message, not a JSON parse error.

Apple sends the email only the first time someone authorizes the app. Later sign-ins use the same Apple subject. A brand-new account still needs that first email.

On Kalb-Mini, after pulling this branch:

1. `npm install` then `npm run build:ios` (or `npx cap sync ios` if `dist/` is already built).
2. `npx cap open ios`. Confirm the App target’s bundle id is `com.antigravity.furniture3d`, team `ZNKG8BKXAT`, and Signing & Capabilities lists **Sign in with Apple**. Automatic signing should refresh the profile to include the entitlement. If Xcode reports a provisioning error, toggle the capability off and on once so it rewrites the profile.
3. Run on a device or simulator signed into an Apple ID. The Apple sheet is the native plugin. The sync API is not inside the app: set `VITE_SYNC_API_URL` to a deployed Worker before `npm run build`, or the token is collected and the account request fails because `capacitor://localhost` has no `/api/v1`.

`capacitor.config.json` `appId` is still `com.antigravity.woodworking3d`. Do not let a Capacitor regenerate replace the Xcode bundle id. The identity-token audience is `com.antigravity.furniture3d`.

## Not in this cut

- StoreKit / IAP products (Pro is decided as Apple IAP; see `docs/monetization.md`)
- Stripe or a web checkout
- Apple account revocation (deleting the Workbench account does not revoke the Apple ID)
- A deployed Worker (no Cloudflare credentials in this environment)
- Remote community (shares stay on the device)

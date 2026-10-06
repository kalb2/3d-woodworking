# Account and project sync

Projects stay in `localStorage` (`ipad_3d_furniture_projects_v1`) and sync to a Workbench account. Create an account with a **username and password** (no email or phone). Sign in with Apple is optional and secondary, and it only opens the native sheet on iOS. The production API is a Cloudflare Worker with D1. The Vite dev server implements the same routes against `.data/sync-dev.json`, so two browsers or devices on one dev server share an account without Apple or Cloudflare secrets.

Conflict rule: last write wins per project `updatedAt`. A delete is a tombstone (`deletedAt`) so an older copy does not come back. The seeded starter id `proj_default` is rewritten once, on the first upload, so two devices do not clobber the same starter.

First sign-in asks **Save and sync** or **Not now**. Nothing uploads until you choose. **Sync now** uploads and turns ongoing sync on. After that, edits debounce to the account, and returning to the app syncs again.

Sign-out keeps the on-device cache. **Delete account** removes Workbench cloud rows and sessions for that username or Apple subject. An Apple ID itself stays in iOS Settings. Local projects remain until you delete them in the app.

On a phone build that has no cloud address yet, Profile stays signed out and says: “Projects stay on this device until cloud sync is turned on.” That sentence is what people see. The app does not call `/api/v1` in that case, and a non-JSON response uses the same sentence.

## API

Prefix: `/api/v1`

| Method | Path | Body | Auth |
| --- | --- | --- | --- |
| GET | `/auth/config` | — | no |
| POST | `/auth/signup` | `{ username, password }` | no |
| POST | `/auth/login` | `{ username, password }` | no |
| POST | `/auth/apple` | `{ identityToken, email?, displayName? }` | no |
| POST | `/auth/signout` | — | bearer |
| GET | `/me` | — | bearer |
| DELETE | `/me` | — | bearer |
| GET | `/projects` | — | bearer |
| PUT | `/projects` | `{ records }` | bearer |

`GET /auth/config` returns `{ devSignIn, mode, appleAudience }`. `mode` is `dev` on Vite and `cloud` on the Worker.

Username accounts: the username is stored lowercase, 3–32 characters, starting with a letter, then letters, numbers, or underscores. The password is 8–200 characters. The server stores PBKDF2-SHA256 (`pbkdf2$iterations$salt$hash`, 100,000 iterations) and never returns the hash on the account. A taken username is `409`. A wrong username or password is `401` with “Username or password is wrong.” Sessions are the same random bearer tokens as Apple sign-in. The account uses `provider: "password"`, `appleSub: "name:<username>"`, and an empty email.

Apple identity tokens are verified with Apple’s JWKS (RS256, issuer `https://appleid.apple.com`, audience `com.antigravity.furniture3d`). No Apple client secret is required. Dev tokens are `dev.` plus base64url JSON `{ email, displayName }` and are accepted only when `ALLOW_DEV_AUTH` is on. That path is not on the Profile screen. The same email maps to one account (`appleSub` `dev:<email>`).

## Environment

| Name | Where | Purpose |
| --- | --- | --- |
| `VITE_SYNC_API_URL` | app build | Worker origin, no trailing slash. Empty uses the same origin, which is correct for `npm run dev`. A Capacitor build (`capacitor://localhost`) must set this to the deployed Worker or Profile stays on-device with the sentence above. People using the app never see this name. |
| `ALLOW_DEV_AUTH` | Worker secret | Set to `1` only on a private dev Worker. Production should omit it so dev email tokens are rejected. Username accounts and Apple tokens still work. |
| `APPLE_AUDIENCE` | Worker secret, optional | Defaults to `com.antigravity.furniture3d`. |
| D1 binding `DB` | `worker/wrangler.toml` | Database name `workbench`. Replace the placeholder `database_id`. |

Dev data file `.data/sync-dev.json` is gitignored.

## Two-device smoke test (no secrets)

1. `npm run dev:host`
2. On both devices, open `http://<this-machine-lan-ip>:5173`
3. Profile → create a username on one device, then **Sign in** with that same username and password on the other
4. On each device, tap **Save and sync**
5. Rename a project on one device, wait a moment (or tap **Sync now**), then reopen the app or tap **Sync now** on the other

The shared file is `.data/sync-dev.json`. Password hashes live in that file under `passwordHashes`, separate from the account object. Two browser profiles against `http://127.0.0.1:5173` exercise the same path. This cut does not require a Cloudflare deploy.

## Worker deploy (when credentials exist)

```sh
npx wrangler d1 create workbench
# paste the database_id into worker/wrangler.toml
npx wrangler d1 execute workbench --file=worker/schema.sql
npx wrangler deploy
```

Run those from a Wrangler install (`npx wrangler`); Wrangler is not a package dependency yet. Not required for this cut. A database created before username accounts needs the `ALTER TABLE` lines commented in `worker/schema.sql` (`username`, `password_hash`, then the partial unique index). Set `VITE_SYNC_API_URL` to the Worker origin for iOS builds when you do deploy.

## Sign in with Apple on device

The App ID `com.antigravity.furniture3d` has Sign in with Apple enabled. The iOS target uses that bundle id, `@capacitor-community/apple-sign-in`, and `ios/App/App/App.entitlements` (`com.apple.developer.applesignin` = Default). Profile is the person icon at the top right of Home and the editor. The primary controls are **Create account** and **Sign in** with a username and password. **Sign in with Apple** sits under those. On iOS it calls `SignInWithApple.authorize`. The browser does not run Apple’s web JS flow; it uses the username form.

A native build with no `VITE_SYNC_API_URL` does not call `/api/v1` on `capacitor://localhost`. Profile stays signed out and shows “Projects stay on this device until cloud sync is turned on.”

Apple sends the email only the first time someone authorizes the app. Later sign-ins use the same Apple subject. A brand-new account still needs that first email.

On Kalb-Mini, after pulling this branch:

1. `npm install` then `npm run build:ios` (or `npx cap sync ios` if `dist/` is already built).
2. `npx cap open ios`. Confirm the App target’s bundle id is `com.antigravity.furniture3d`, team `ZNKG8BKXAT`, and Signing & Capabilities lists **Sign in with Apple**. Automatic signing should refresh the profile to include the entitlement. If Xcode reports a provisioning error, toggle the capability off and on once so it rewrites the profile.
3. Run on a device. Username sign-in works once the app can reach the API. The Apple sheet is the native plugin and needs an Apple ID on the device. Until `VITE_SYNC_API_URL` points at a deployed Worker, a Capacitor build keeps projects on the device and shows the sentence above.

`capacitor.config.json` `appId` is still `com.antigravity.woodworking3d`. Do not let a Capacitor regenerate replace the Xcode bundle id. The identity-token audience is `com.antigravity.furniture3d`.

## Not in this cut

- StoreKit / IAP products (Pro is decided as Apple IAP; see `docs/monetization.md`)
- Stripe or a web checkout
- Apple account revocation (deleting the Workbench account does not revoke the Apple ID)
- A deployed Worker (no Cloudflare credentials in this environment)
- Remote community (shares stay on the device)

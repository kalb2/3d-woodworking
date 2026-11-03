# App Store readiness

Checklist for The Workbench (`com.k24corp.workbench`; the bundle id was `com.antigravity.furniture3d` before the rename). StoreKit is not in this build. Pro stays a later App Store In-App Purchase. See `docs/monetization.md` and `docs/iap-test-plan.md`. Device steps are in `docs/smoke-test.md`.

## App identity

- [ ] Apple Developer App ID `com.k24corp.workbench` has Sign in with Apple (the first signed build with `-allowProvisioningUpdates` registers it)
- [ ] The Sign in with Apple key used for revocation (`APPLE_KEY_ID`) is enabled for `com.k24corp.workbench`
- [x] Xcode target bundle id is `com.k24corp.workbench` (Debug and Release), team `ZNKG8BKXAT`
- [x] Entitlement file `ios/App/App/App.entitlements` sets `com.apple.developer.applesignin` to Default
- [x] `capacitor.config.json` `appId` is `com.k24corp.workbench`, matching Xcode
- [ ] App Store Connect record uses that same bundle id
- [ ] On Kalb-Mini, Signing & Capabilities lists **Sign in with Apple**. If the profile is stale, toggle the capability off and on once

`ios/` was not regenerated for the app id alignment. The native config copy `ios/App/App/capacitor.config.json` is gitignored. The next `npx cap sync ios` refreshes that copy. Do not delete `ios/` and do not run `npx cap add ios`. Either of those can recreate the Xcode project from scratch.

Display name in `Info.plist` is The Workbench. Marketing version is `1.0`, build `1`, until those numbers are bumped in the Xcode target.

## Sign in

Account creation is a username and password. No email or phone is required. Sign in with Apple is the second button and opens only in the iOS app. The identity-token audience is `com.k24corp.workbench`. The Worker also accepts `com.antigravity.furniture3d` for builds installed before the rename.

Username-only accounts are an acceptable App Store path when the app does not offer another social login (Google, Facebook, and similar). Apple sign-in stays available. It is not required to create an account.

- [ ] Review notes say that: username is the account, Apple is optional, and there is no other social login

## Privacy labels

Answer App Privacy from what this build actually does.

Collected and sent to the sync Worker (`https://workbench-sync.k24corp.workers.dev`):

- Username and a password hash (the app never stores the raw password on the server response)
- Optional Apple email and name, only the first time someone uses Sign in with Apple
- Projects the person chooses to save and sync

Diagnostics: `ios/App/App/AppDelegate.swift` starts Sentry (`sentry-cocoa`) with `sendDefaultPii = false` and `tracesSampleRate = 0.1`. The SDK does not attach the device IP address, name, or email. Release uses the `production` environment. Debug builds set Sentry’s debug flag. JavaScript errors from the WebView are posted to the same project as the error name and message only, and only from the iOS app.

Permissions actually used:

- Camera (and LiDAR): RoomPlan wall scan. `Info.plist` has `NSCameraUsageDescription`. If the person has denied camera access, the scan screen says “Camera access is off”, with Open Settings and Cancel.
- Photos: not used. Snapshots and exports go to the Files app and the share sheet. There is no photo-library purpose string.
- Microphone and speech recognition: not used. Describe it dictation is the system keyboard mic, which does not need an app purpose string.
- Files: documents are written in the app’s Documents folder (`UIFileSharingEnabled`). iOS has no purpose string for that.

Not in this app: location, contacts, advertising identifier, or a tracking prompt.

- [ ] App Privacy lists account data, user content (projects), and diagnostics. It does not list tracking or IP address
- [x] `sendDefaultPii` is off. Diagnostics are crash, performance, and other diagnostic data, not linked to the account
- [ ] Privacy policy URL in App Store Connect covers the username account, optional Apple sign-in, project sync, and crash reports. The in-app link is the production site (`src/config/links.ts`). That site is still behind Vercel Deployment Protection until it is made public

## Sentry dSYM

Release is `DEBUG_INFORMATION_FORMAT = dwarf-with-dsym`. Debug is `dwarf` only, so a Debug install will not produce a dSYM.

- [ ] Archive a Release build
- [ ] Upload that archive’s dSYM to the Sentry project used by `AppDelegate.swift`. The Xcode target links Sentry and does not run an upload build phase yet. From the archive:

  ```sh
  # Org slug and project slug are the ones in Sentry for DSN project 4512189597024256.
  sentry-cli debug-files upload --org <org-slug> --project <project-slug> \
    path/to/The\ Workbench.app.dSYM
  ```

- [ ] Confirm a test crash from TestFlight symbolicates

## Worker URL

Device builds must call the Worker. Same-origin `/api/v1` works for `npm run dev` and does not exist inside `capacitor://localhost`.

```sh
printf '%s\n' 'VITE_SYNC_API_URL=https://workbench-sync.k24corp.workers.dev' > .env.production
npm run build:ios
```

No trailing slash. Leave `ALLOW_DEV_AUTH` unset on this Worker. D1 database `workbench` is `e87ee84f-66b3-4e33-9aad-ca20e995534c`. Details are in `docs/account-sync.md`.

- [ ] The installed build signs up a username against that origin (see `docs/smoke-test.md`)
- [ ] A build without that variable stays signed out and says projects stay on this device until cloud sync is turned on

## In-App Purchase

Pro, extra cloud, and paid templates are App Store IAP only. There is no Stripe or web checkout for those digital goods.

- [ ] Do not submit a Pro purchase button in this cut. There is no StoreKit code and no product id yet
- [ ] When products exist, follow `docs/iap-test-plan.md` before a paywall build goes to TestFlight

## Screenshots

Capture the current UI, not an older editor menu.

- [ ] iPhone and iPad sizes that App Store Connect asks for on the day you upload
- [ ] Home, with the profile icon at the top right
- [ ] Editor, with Home, the project name, units, the ⋯ menu, and the bottom bar (Move, Resize, Rotate, Duplicate, Delete, Add)
- [ ] Home → Templates. Templates are not an editor-menu item

## TestFlight

- [ ] Archive Release, upload, and add internal testers on the Kalb devices
- [ ] Export compliance: the app speaks HTTPS to the Worker and to Sentry. Standard exemption applies if you have not added custom encryption
- [ ] Run `docs/smoke-test.md` on an iPhone and an iPad from the TestFlight build
- [ ] Sign in with Apple once on a device that is signed into an Apple ID, after the username path already works

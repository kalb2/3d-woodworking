# App Store review risks

Checked for The Workbench (`com.k24corp.workbench`, team `ZNKG8BKXAT`) before a first submission. Status is **fixed** (changed in this pass), **ok** (checked, already in good shape), or **needs-owner** (App Store Connect, Sentry, the live Worker, or the public site — not something this code change can finish).

The Worker was not deployed.

## App

| Item | Status | Notes |
| --- | --- | --- |
| Camera usage description | ok | `NSCameraUsageDescription` matches the RoomPlan wall scan. |
| Photo library usage description | fixed | The app does not read or save the photo library. Snapshots use the Files app and the share sheet. The unused “add to Photos” purpose string was removed so review does not see a permission the app never asks for. |
| Microphone / speech for dictation | ok | Describe it tells people to use the keyboard mic. That is system dictation. The app does not call the microphone or speech APIs, so it must not declare those purpose strings. |
| Files | ok | Exports write into the app Documents folder. `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` are set. iOS has no purpose string for that. |
| Privacy manifest required-reason APIs | ok | App manifest declares UserDefaults `CA92.1` (Sign in with Apple plugin) and file timestamps `C617.1` (Filesystem `stat` via ion-ios-filesystem). Those plugins do not ship their own reasons. Capacitor’s manifests declare none. Disk space and boot time are not used by the app plugins. Sentry.framework ships its own manifest. |
| Account deletion | ok | Delete account removes cloud projects and sessions, then signs out. Apple accounts ask for a fresh Sign in with Apple code so the Worker can revoke the token. The screen says projects already on the device stay until the person deletes them. |
| Sign in with Apple | ok | Optional next to username/password. No other social login. Audience is `com.k24corp.workbench`. Revocation runs when the Worker has the Apple key. |
| Sign in with Apple revocation secrets on the live Worker | needs-owner | `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` must be set on `workbench-sync`. Without them the account still deletes and the app tells the person to remove The Workbench under Settings → Sign in with Apple. |
| Sign in with Apple button artwork | needs-owner | The control says “Sign in with Apple” but it is not the system button. Confirm it matches the Human Interface Guidelines before submission. |
| Debug UI and dev sign-in | ok | Dev sign-in is not on the Profile screen. The on-device AI self-test runs only in Debug builds launched with `WB_AI_SELFTEST=1`. |
| Hidden Describe it mock | fixed | `workbench_ai_mock` (and `VITE_AI_MOCK`) is ignored unless the build is a dev build, so a release binary cannot fake Describe it results. |
| Placeholder / lorem copy | ok | No lorem or unfinished placeholder copy in the UI. |
| “iPad and desktop” tutorials line | fixed | Tutorials now say “on iPhone and iPad”. |
| Site URL in the app | needs-owner | About links use the production site `https://workbench-site-two.vercel.app`. It is still behind Vercel Deployment Protection. Make it public and use that same URL for Privacy Policy and Support in App Store Connect. |
| 3D export and Copy JSON | fixed | Export USDZ, Export GLB, and Copy project JSON are hidden behind `MODEL_EXPORT_ENABLED`, which is off. The export code is still there. |
| Describe it when Apple Intelligence is off | fixed | The Add row is hidden until on-device Apple Intelligence is available (or a dev mock is on). `DESCRIBE_CLOUD_ENABLED` stays false. No paid AI. |
| React error boundary | fixed | A render error shows “Something went wrong” and **Back to projects** instead of a white screen. `window.onerror` and unhandled rejections are installed too. |
| Imported part sizes and positions | fixed | Non-finite or absurd sizes and positions are dropped. A file with no drawable parts is rejected. |
| 3D memory | fixed | Part meshes, hole markers, group outlines, scanned-room boxes, and resize hit-tubes dispose geometries and materials when they are replaced and when they unmount. Shared wood textures stay cached. Hole and joint cutters are disposed after the cut. |
| Safe area | ok | Home, editor chrome, and sheets already used `viewport-fit=cover` and safe-area insets. The iPad home header now includes the top inset as well. |
| Keyboard overlap | fixed | `--keyboard-inset` lifts the phone tool sheet and new-project / Describe it sheets, and adds scroll padding so a focused field can move above the keyboard. |
| Icon-only button labels | ok | Icon-only controls (Home, More, Add, Undo, Redo, Close, profile, hole size, turn) already have `aria-label`s. |
| Autosave | ok | Edits call `saveCurrentProject`. Leaving the app also writes the in-memory projects once a load has succeeded, without marking them newly edited. |
| Corrupt on-device file | fixed | If the saved project JSON cannot be read, a copy is kept under `ipad_3d_furniture_projects_corrupt` before any later save replaces the main key. |
| Offline | ok | Projects stay on device. A failed sync is marked offline and does not wipe local work. With no Worker URL, Profile says projects stay on this device. |
| Sentry PII | fixed | `sendDefaultPii` is false. Trace sample rate is 0.1. JS reports are name and message only, iOS only, and include no account or project body. |
| Sentry dSYM upload | needs-owner | Release already builds dSYMs. The Xcode target still has no upload phase. Steps are in `docs/app-store-readiness.md`. |
| App Store Connect metadata and screenshots | needs-owner | Record, privacy answers, review notes (username account, Apple optional, no other social login), export compliance, and current screenshots. See `docs/app-store-readiness.md`. |

## Worker

Auth checks and rate limiting were left alone on purpose (another change owns sync and auth). This pass did not deploy the Worker.

| Item | Status | Notes |
| --- | --- | --- |
| Input validation and size limits | ok | `PUT /projects` already rejects a body over 2,000,000 bytes and records missing an id, `updatedAt`, and a project or `deletedAt`. Signup checks username and password shape. |
| Auth on routes | needs-owner | Project and account routes require a session. Public routes are config, signup, login, and Apple sign-in. Not changed here. |
| CORS | ok | Preflight allows the `Authorization` header the app sends. Not changed here, so `capacitor://localhost` is not broken. |
| Rate limiting | needs-owner | Describe it has a limiter, and that route is not mounted while the cloud flag is off. A general limit on signup and login was not added. |

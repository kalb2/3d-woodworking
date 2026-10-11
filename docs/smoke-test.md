# Device smoke test

Run this on an iPhone and an iPad after `npm run build:ios` with the Worker address baked in:

```sh
printf '%s\n' 'VITE_SYNC_API_URL=https://workbench-sync.k24corp.workers.dev' > .env.production
npm run build:ios
```

No trailing slash. A build without that line keeps projects on the device and will not sign up. `npm run dev` on a computer still uses the local Vite sync file and is a separate check.

Bundle id is `com.antigravity.furniture3d`. Team `ZNKG8BKXAT`.

## Home and profile

- [ ] Home opens. The person icon is at the top right. It is not on the Projects / Templates / Community tab bar
- [ ] Tap the icon. Profile offers **Create account** and **Sign in** with a username and password. There is no email or phone field
- [ ] **Sign in with Apple** is under that form, not the primary button
- [ ] Open a project, then look at the editor header. There is no profile icon there. Back to Home, the profile icon is still at the top right

## Username against the Worker

Use a new username (a letter, then letters, numbers, or underscores, 3–32 characters) and a password of at least 8 characters.

- [ ] Create account. The profile shows that username and the badge Username
- [ ] Choose **Save and sync**. The starter project uploads
- [ ] Sign out, then **Sign in** with the same username and password
- [ ] A wrong password says the username or password is wrong
- [ ] On a second device, or a second install, sign in with the same username. **Save and sync** shows the project from the first device
- [ ] The request host is `https://workbench-sync.k24corp.workers.dev`, not `capacitor://localhost`

## Editor

- [ ] Top bar is Home (back), the project name, units, and ⋯
- [ ] Bottom bar is Move, Resize, Rotate, Duplicate (blue), Delete (red), and Add. Labels stay visible. The floor row is there while Move is active. The home-indicator inset is still padded
- [ ] Add opens shapes (boxes, planks, and the rest). Place one part. Move, resize, and rotate still track that part
- [ ] ⋯ includes Parts list, Cut list, Settings, Share project, and Rename project
- [ ] ⋯ does not include Add shapes, Templates, Community, Presets, or New project

## Templates stay on Home

- [ ] From the editor, go Home and open the Templates tab. A template can start a project
- [ ] Community is the Home tab, not an editor menu row

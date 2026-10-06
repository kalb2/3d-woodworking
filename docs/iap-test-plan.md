# IAP test plan

Pro is App Store In-App Purchase. This file is the test plan for when products exist. This cut has no StoreKit code, no product identifiers, and no paywall. Do not add a StoreKit framework or a purchase button to satisfy this plan.

Digital goods (Pro, extra cloud, paid templates) stay inside IAP. There is no website checkout and no Stripe path for them. See `docs/monetization.md`.

## Before any test

- [ ] Products created in App Store Connect for bundle id `com.antigravity.furniture3d` (subscription or non-consumable, matching the offer you actually sell)
- [ ] Paid Applications agreement and banking are active on the developer account
- [ ] A sandbox Apple ID that is not the same Apple ID as the device’s Media & Purchases account
- [ ] The build under test includes StoreKit and the product ids. Until that build exists, stop here

Suggested product split, once you name them:

| Product | Unlocks |
| --- | --- |
| Pro | The paid feature set you choose (extra cloud quota, paid templates) |
| Restore | The same entitlements on a new install, no second charge |

The sync Worker should treat the App Store entitlement as the source of truth. The iOS app should not unlock Pro from a local flag alone.

## Sandbox purchase

- [ ] Install the TestFlight or dev build. Sign out of the sandbox account first so the sheet asks
- [ ] Start the Pro purchase. The system sheet is Apple’s, and the price is the sandbox price
- [ ] Complete with the sandbox Apple ID. The app shows Pro unlocked
- [ ] Force-quit and relaunch. Pro is still unlocked
- [ ] The Worker account for that username reports the same entitlement
- [ ] Cancel on the sheet. The app stays on the free tier and does not show a crash
- [ ] Repeat with Ask to Buy pending, then approve it. Pro unlocks after approval

## Restore

- [ ] Delete the app and install it again
- [ ] Sign into the same Workbench username
- [ ] Tap Restore purchases. Pro returns without a new charge
- [ ] Restore with a sandbox Apple ID that never bought Pro. The app stays free and explains that nothing was found
- [ ] Restore while offline. The app keeps the last known entitlement or stays free, and it does not grant Pro because the request failed

## Pro gates

Until a feature is actually gated, skip that row.

- [ ] Signed out: paid templates and extra cloud are unavailable, and the free editor still opens
- [ ] Signed in, no purchase: the same free limits
- [ ] After purchase: extra cloud quota and paid templates open for that username
- [ ] A second device, same username, after restore or sync: the same Pro access
- [ ] Expired or revoked subscription: Pro closes on the next entitlement check, and projects already on the device remain
- [ ] Free features (local projects, username sign-in, the editor bottom bar) keep working with no purchase

## What not to test yet

- StoreKit in the current branch
- A web paywall, Stripe, or a “subscribe on our site” link inside the iOS app
- Receipt fields invented before the products exist

# Monetization

Kaleb chose **App Store In-App Purchase** for Pro.

Digital goods — Pro, extra cloud storage, and paid templates or packs — are sold with Apple IAP. This app does not use a website checkout, Stripe, or any other external pay flow for those digital goods.

Physical goods or a separate website-led purchase are not the Pro path. They stay out of this product until there is a real physical or website offer to design.

## This cut

StoreKit, product identifiers, entitlements, and a pay button are **not** implemented. Sign in with Apple, the profile, and project sync do not check a subscription. Everyone who can sign in can sync projects in this build.

When IAP lands later, it should gate Pro features (extra cloud, paid templates) on a StoreKit entitlement verified on the sync Worker. It should not add a web paywall for the iOS app.

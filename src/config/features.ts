/**
 * Build-time feature flags. Change a value here and rebuild (app and Worker).
 */

/**
 * Describe it cloud fallback (Workers AI on the sync Worker, or the optional paid
 * AI_API_KEY provider). OFF for 1.0: Describe it runs only on Apple's on-device
 * model (FoundationModels). With this off the app never POSTs /ai/describe and the
 * Worker does not mount the route. The cloud code stays in src/ai so it can come
 * back later; turning it on also needs a consent step (App Review 5.1.2(i)) and
 * matching privacy-label / privacy-page updates.
 */
export const DESCRIBE_CLOUD_ENABLED = false as boolean;

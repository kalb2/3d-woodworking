/**
 * Public site links shown in the app (••• menu → About).
 *
 * This is the Workbench site's stable Vercel production URL (the project's
 * production domain, not a per-deploy preview URL), so it keeps working across
 * site deploys. It must match the Privacy Policy URL and Support URL entered in
 * App Store Connect.
 *
 * PENDING: the site is still behind Vercel Deployment Protection (anonymous
 * visitors get a login page) until it is made public at submission prep.
 */
export const SITE_BASE_URL = 'https://workbench-site-two.vercel.app';

export const PRIVACY_POLICY_URL = `${SITE_BASE_URL}/privacy`;
export const SUPPORT_URL = `${SITE_BASE_URL}/support`;

/**
 * Open a link outside the app. In the iOS app, Capacitor hands a new-window
 * navigation to Safari; on the web it opens a new tab.
 */
export function openExternal(url: string, open: (url: string, target: string, features: string) => unknown = window.open.bind(window)) {
  open(url, '_blank', 'noopener');
}

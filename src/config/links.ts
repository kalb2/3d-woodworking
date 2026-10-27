/**
 * Public site links shown in the app (••• menu → About).
 *
 * PENDING: this is the current Vercel deployment of the Workbench site, which is
 * still behind Vercel Deployment Protection (anonymous visitors get a login page).
 * Swap in the final public production URL before App Store submission. It must
 * match the Privacy Policy URL and Support URL entered in App Store Connect.
 */
export const SITE_BASE_URL = 'https://workbench-site-ia8vv6jx8-kalb2s-projects.vercel.app';

export const PRIVACY_POLICY_URL = `${SITE_BASE_URL}/privacy`;
export const SUPPORT_URL = `${SITE_BASE_URL}/support`;

/**
 * Open a link outside the app. In the iOS app, Capacitor hands a new-window
 * navigation to Safari; on the web it opens a new tab.
 */
export function openExternal(url: string, open: (url: string, target: string, features: string) => unknown = window.open.bind(window)) {
  open(url, '_blank', 'noopener');
}

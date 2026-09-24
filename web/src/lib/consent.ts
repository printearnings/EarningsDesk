/**
 * Cookie-banner consent, shared by the banner (client) and the root layout
 * (server, static export). A plain module on purpose: importing a value from a
 * "use client" file into a server component yields a client reference, not the
 * string.
 *
 * Bump the suffix when what the banner discloses changes materially, so a
 * stored choice made against an old disclosure doesn't cover a new one.
 * v2: the site now runs Google AdSense.
 */
export const COOKIE_CHOICE_KEY = "earningsdesk:cookie-choice-v2";

/**
 * Inline <head> script: if the visitor rejected non-essential cookies, ask
 * AdSense for non-personalized ads only. Inline (not a same-origin file) so it
 * runs synchronously during parsing - an async <script> like the AdSense loader
 * can never execute before it, even when React hoists that loader above it.
 */
export const ADS_CONSENT_INLINE_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  COOKIE_CHOICE_KEY,
)})==="rejected"){(window.adsbygoogle=window.adsbygoogle||[]).requestNonPersonalizedAds=1}}catch(e){}})();`;

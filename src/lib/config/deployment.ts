/**
 * Deployment fallback defaults.
 *
 * Values here are safety-net fallbacks used when a request doesn't specify them
 * (e.g. a caller other than the publish wizard). User-facing preferences are
 * configured in the app's Settings — not here — so operators never need to
 * touch env vars or code to change normal business settings.
 *
 * This is server-side config — do not import it into client components.
 */

/**
 * Fallback minimum audience age, used only when a publish request omits it.
 * The normal source of truth is the org-wide setting `defaultAgeMin`
 * (Settings → Ad Setup → Audience Defaults), which the publish wizard sends
 * on every ad set. 18 is Meta's platform floor. If your product is
 * age-restricted (e.g. alcohol → 21 in the US), raise this so the compliance
 * floor stays safe even if the setting is ever missing.
 */
export const DEFAULT_AGE_MIN = 18;

/**
 * Countries every ad set targets. The publish wizard doesn't expose geo
 * targeting yet, so this is also the country list Meta requires on campaigns
 * with a special ad category (`special_ad_category_country`) — keep the two
 * in sync by using this constant for both.
 */
export const DEFAULT_TARGET_COUNTRIES = ['US'];

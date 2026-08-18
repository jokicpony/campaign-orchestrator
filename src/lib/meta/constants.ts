/**
 * Meta Graph API version — single source of truth for all server routes
 * and the shared client library.
 *
 * Marketing API v24.0 expires October 6, 2026 — bumped to v25.0 (released
 * Feb 18, 2026) ahead of that sunset. Before this bump, the flexible-ad
 * payload (creative_asset_groups_spec — removed from the READ schema but
 * still accepted as a write-side compat shim) was verified via
 * execution_options=["validate_only"] against v24/v25/v26: accepted on all
 * three (Aug 2026).
 * Keep this aligned with https://developers.facebook.com/docs/graph-api/changelog/versions/
 */
export const GRAPH_API_VERSION = 'v25.0';
export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
export const FACEBOOK_OAUTH_DIALOG_BASE = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;

/**
 * Meta Graph API version — single source of truth for all server routes
 * and the shared client library.
 *
 * Marketing API v24.0 expires October 6, 2026 — bumped to v25.0 (released
 * Feb 18, 2026) ahead of that sunset. v25.0's expiry is not yet announced;
 * v26.0 shipped Jul 29, 2026 (several of its changes apply to all versions
 * from Oct 27, 2026). Before this bump, the flexible-ad payload
 * (creative_asset_groups_spec) was verified via
 * execution_options=["validate_only"] against v24/v25/v26: accepted on all
 * three (Aug 2026). As of Sep 2026 Meta still documents it with no
 * deprecation notice; "Multi-media ads" (media_sourcing_spec) is the newer
 * alternative to evaluate.
 * Keep this aligned with https://developers.facebook.com/docs/graph-api/changelog/versions/
 * and with GRAPH_API_VERSION in functions/transcode-and-upload/src/index.ts.
 */
export const GRAPH_API_VERSION = 'v25.0';
export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
export const FACEBOOK_OAUTH_DIALOG_BASE = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;

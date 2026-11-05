# Changelog

## 2.0.0 — November 2026

A simplification release. The goal is fewer steps per ad and less to maintain:
one AI provider, fewer settings, and copy tools built around the ad you're
working on.

### New

- **Copywriter** (Palette → Copy → Copywriter). One Gemini conversation per
  campaign. Pick an ad, hit **Fill this ad** and choose an angle (or Any angle)
  to write one piece per empty slot, mixing angles, formats and lengths; or ask
  in plain words and **Use** what you like. **Long-form story** writes one
  long, story-driven primary text from a story you describe. **Split** widens
  the Palette to share the screen with the rows.
- **Campaign Context** (next to Add Row). Up to 5 public links plus notes per
  campaign. Each page is read once and condensed into a fact sheet the
  copywriter uses. Public Google Docs and Drive PDFs work too.
- **Write your own** in the Copy tab, and you can type straight into any empty
  copy slot. Headlines are blue and primary text orange everywhere copy shows.
- **Top performers → Import** keeps the headlines and primary texts behind 80%
  of the ad account's spend in the last 90 days (up to 15 of each), optionally
  only ads whose name matches a product.
- **Active Palette navigation**: In use / Unused (with Clear unused), source
  and This ad filters, sort by most used, newest or top performance, search on
  big builds, and links to the ads each card is in.
- **Review shows the ad as it will look in the feed**, with **Next mix** to
  step through the copy Meta rotates. **Publish N reviewed** in the Review
  header sends every reviewed, unpublished ad to the wizard.
- **Settings → Usage**: the team's AI calls, tokens and estimated cost for the
  last 7 or 30 days.
- Rows are shorter (each copy column shows its filled slots plus one empty
  one) and ad names save themselves from the naming template.

### Changed

- **AI is Gemini only, with one server-side key** (`GEMINI_API_KEY`).
  Optional `GEMINI_MODEL` and `GEMINI_SUMMARY_MODEL` override the models.
- **Settings → Copywriter** replaces Brand Voice, Products, Personas and
  Modifiers. It keeps brand voice, target personas (plain text) and the kill
  list; product facts now come from each campaign's Context links.
- **Single Image / Single Video take one asset.** A row holding more (switched
  from another type) publishes only the first; changing type never drops
  assets.
- The minimum audience age now defaults to 18 (Meta's floor) on a new
  instance; a saved Settings value is kept. Age-restricted products set 21 in
  Settings → Ad Setup.
- Team settings load after sign-in (they used to be read too early and could
  come back empty).

### Removed

- **Flexible ad type.** Multi-Media replaces it. Saved Flexible rows open as
  Multi-Media; the publish route rejects `flexible`.
- The AI Co-Writer tab, Anthropic and OpenAI support, personal AI keys, the
  model picker, temperature and modifier settings, and the product catalog.

### Security and fixes

- Ids from the browser are validated before they go into Graph or Drive URL
  paths.
- Context links are fetched through a guard that refuses private and internal
  addresses on every redirect, and page text is fenced as data in the prompt.
- The kill list is enforced on the model's output, not only in the prompt.
- Dependency advisories patched; `overrides` lift Firebase's pinned
  `@grpc/grpc-js` and `google-gax`'s `rimraf`/`glob`.
- `npm test` now also covers the copywriter, top performers, request ids and
  the Active Palette.

### Upgrading from 1.x

1. Pull the release and run
   `npm install && npm run lint && npx tsc --noEmit && npm test && npm run build`.
2. In your hosting env vars, make sure **`GEMINI_API_KEY`** is set. Delete
   `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`; they're no longer read. Redeploy.
3. **Deploy both rules files** (keep your allowlist in each):
   `npx firebase-tools deploy --only firestore:rules,storage --project <project-id>`.
   Check the deployed versions in the Firebase console.
4. Open **Settings → Copywriter** and check the brand voice, target personas
   and kill list. Personas saved in 1.x are converted to plain text the first
   time Settings loads; products and modifiers are no longer used.
5. Optional clean-up in Firestore: the `providerKeys` field on
   `settings/global` and on each `serverSecrets/{uid}` document (old AI keys)
   is no longer read. Delete it and rotate those keys.
6. Rows saved as Flexible open as Multi-Media. Publish one to a paused test
   campaign and check it in Ads Manager before a big batch.

No OAuth scopes changed, so nobody needs to reconnect Meta.

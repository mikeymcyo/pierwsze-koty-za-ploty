# StoreVision Street View Preview pilot

Status: implementation prepared; NOT a working 20-store pilot yet. No frontage has been visually verified and the shipped viewpoint list is deliberately empty. Do not invent coordinates or populate from postcode centroids.

## Before enabling
- Verify up to 20 Lidl store frontages against the existing directory in a real browser. Record road viewpoint latitude/longitude, heading, pitch, field of view and review date in lib/stores/storevision-viewpoints.json. Each record must use directoryId lidl-gb and an existing code. Check the entrance actually appears at that camera position.
- Use a dedicated GOOGLE_MAPS_EMBED_BROWSER_KEY restricted to Maps Embed API only and the exact controlled Preview host(s). This is a browser credential: Google's iframe requires it in the URL. Never reuse a secret server-side Places key, print the value, or commit it. Configure it in Vercel securely, not through chat.
- Google currently requires a billing-enabled Cloud project for setup, although Maps Embed usage itself is free. Account creation, terms and billing setup require owner involvement. No Cloud or Vercel settings have been changed by this implementation.
- Set STOREVISION_ENABLED=true only for the pilot Preview branch. The code additionally requires VERCEL_ENV=preview and refuses Production even with that flag enabled.
- Add/review public privacy and terms disclosures covering Google embedded content before enabling for testers. The viewer does not contact Google until the user opens it.

## Behaviour
No Places search, photo-media, Static Street View or geocoding API calls; no image downloads, caching or new database tables. One interactive iframe when opened; closing removes it. Google owns its embedded controls and attribution, which must remain visible. Position is below existing work and directions. External Maps link is always accessible while the viewer is open, because cross-origin frame errors cannot be reliably diagnosed by the host app.

A location can snap to a different panorama when Google refreshes coverage. Recheck the chosen entrance views; they are reference imagery, not current report evidence. No personal photos are used.

## Verification
Run e2e/storevision-streetview-smoke.mjs with the existing register-tsx loader, lint, typecheck, build, test:stores and test:store-continuity. Review 320px and 390px layouts, iframe attribution/controls, opening/closing, fallback link, Google-blocked and offline states, and physical iPhone interaction. Confirm zero requests to Google before opening. Confirm no panel for non-pilot stores or Production. Do not label Preview ready until all 20 selected frontages and the actual restricted-key embed have been verified.

Official references checked 2 November 2026:
- https://developers.google.com/maps/documentation/embed/usage-and-billing
- https://developers.google.com/maps/documentation/embed/embedding-map
- https://developers.google.com/maps/documentation/embed/get-api-key

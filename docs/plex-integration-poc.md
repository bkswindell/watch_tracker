# Plex trailer/extras integration POC

## TL;DR

This is a bounded, fixture-tested Plex adapter POC. It normalizes supported Plex extras into provider-neutral records and is intentionally not wired into the MVP production path. No Plex credentials are stored in the repository.

## Setup

The later live probe is opt-in and requires runtime environment variables:

```sh
PLEX_PROBE=1 \
PLEX_BASE_URL=http://swi-pro-ds:32400 \
PLEX_ALLOWED_HOST=swi-pro-ds \
PLEX_TOKEN='provided-at-runtime' \
npm run plex:probe
```

`PLEX_METADATA_KEY` is optional and defaults to `/library/metadata/5d77687f103a2d001f5737bb`. The probe prints only the origin, metadata key, and count; failures redact token-like query values and never print the token.

For fixture-only validation, run `npm test`. The six-entry mixed fixture does not contact Plex.

## Safety boundaries

- Base URLs are accepted only from explicit runtime configuration; there is no per-request URL input.
- Only `http`/`https` URLs without credentials, query strings, or fragments are accepted.
- Hosts must be localhost, loopback/private IPv4, `.local`, or an exact `PLEX_ALLOWED_HOST` match. Public arbitrary hosts are rejected.
- The metadata key is constrained to `/library/metadata/<safe-id>` and is joined to the validated base URL.
- Extras must have a relative Plex key and a supported type. Thumbnail/stream URLs are retained only when same-origin with the configured Plex base URL.
- The adapter sends the token only as the `X-Plex-Token` request header. It is never logged.
- This POC does not scrape Plex Web HTML and does not embed credentials.

## Normalized fields

Each supported extra becomes `{ provider, providerKey, name, type, durationMs, thumbnailUrl, streamUrl, sourceUrl }`. Supported types are trailer, teaser, interview, behind-the-scenes, deleted scene, and featurette. Records are deduplicated by a deterministic SHA-256 key over provider, provider key, and normalized type.

## Next integration step

After Brad confirms a reachable private endpoint and supplies credentials through the deployment secret mechanism, add a server-side catalog refresh seam that calls this adapter with an allowlisted configuration, stores normalized extras, and exposes them to the UI. Keep the probe and adapter fixture tests as the contract; do not pass arbitrary URLs from user input.

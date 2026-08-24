# Phase 1 builder status

**Checkpoint:** `c01000240d75b6102ade40c7ac45458aefee71e4` — `feat(security): enforce bounded session lifetimes`

- **Delivered:** sessions now use a 30-day sliding idle lifetime capped by a 90-day absolute lifetime in both memory and PostgreSQL stores. Additive schema migration `0.08_session-lifetimes` backfills existing session timestamps and does not alter immutable Pack or owner-owned records.
- **Validation:** focused auth/migration suite passed (23 tests); `npm run check` passed (102 portable tests); deterministic build passed (25 artifacts); production audit found 0 vulnerabilities; production image `watch-tracker:verify` built successfully.
- **Live:** migration `0.08` applied successfully (`PASS migrations=8 schema=0.08`), then only the app service was recreated. Database container/volume and credentials were not changed. App and database are healthy; `http://10.18.0.201:3100/ready` returns ready.
- **Browser:** browser proof remains blocked because the cron harness cannot start or find a supported Chromium-family browser. No credential was read or changed and no proof was fabricated.
- **Remote/CI:** branch and PR #4 head verified at `c01000240d75b6102ade40c7ac45458aefee71e4`; Validate Core run `32786833530` is in progress.
- **Remaining accepted auth gates:** Argon2id/password policy and host-controlled recovery. Recovery needs provider/UX decisions; continue the Argon2id/password-policy lane without credential changes.
- **Historical audit:** remains **FAIL** until all accepted authentication/session gates pass.

# Phase 1 builder status

**Checkpoint:** `9c47d4692e9de96186d4b13812013c7ab24506fa` — `feat(security): adopt Argon2id password credentials`

- **Delivered:** new setup credentials now use Argon2id (`m=65536`, `t=3`, `p=1`); the host-provided initial password is checked for a 15–1024 character, no-NUL policy before startup and SQL setup. Existing scrypt credentials have verification-only compatibility so deployment does not rewrite a credential.
- **Validation:** focused auth/SQL suite passed (8 tests); `npm run check` passed (104 portable tests); deterministic build passed (25 artifacts); production audit found 0 vulnerabilities; production image `watch-tracker:verify` built successfully.
- **Live:** no migration was required. Only the app service was rebuilt/recreated; the database container/volume and credentials were not changed. App and database are healthy; `http://10.18.0.201:3100/ready` returns ready.
- **Browser:** browser proof remains blocked because the cron harness cannot start or find a supported Chromium-family browser. No credential was read or changed and no proof was fabricated.
- **Remote/CI:** `automation/phase1` remote SHA was verified at `9c47d4692e9de96186d4b13812013c7ab24506fa`; this checkpoint requires a fresh Validate Core result.
- **Remaining accepted auth gate:** host-controlled recovery. Its provider and UX delivery details remain unambiguous only once the host delivery channel is specified; do not access or change credentials to infer it.
- **Historical audit:** remains **FAIL** until all accepted authentication/session gates pass.

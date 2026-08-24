# Phase 1 builder status

**Checkpoint:** `882a7dc31cbcb93adbbfe54c4159724f91e60e60` — `docs(progress): record green throttle CI`

- **Delivered auth/session gate:** exact scheme/host/port Origin validation in addition to token CSRF; bounded five-attempt/15-minute per-client login throttling; authenticated CSRF-protected logout with server-side session invalidation and cookie expiry; 30-day sliding idle and 90-day absolute session lifetimes; Argon2id fresh credentials at `m=65536`, `t=3`, `p=1` with the accepted password policy. Login throttle state is capped at 10,000 active entries.
- **Independent validation:** focused auth/SQL invocation passed all 106 portable tests, including hostile Origin, throttle/reset/bounded-state, logout invalidation, cookie/session lifetime, Argon2id, owner isolation, and immutable Pack separation coverage.
- **Live proof:** credential-free exact-Origin API proof returned `409 setup.unavailable`; opposite-scheme same-host returned `403 csrf.invalid`. The app is healthy on image `sha256:19f0a7c89eefacf20c3e84e04e9d633574301b2c952c9f2c0bc616b1ba3ae6ad`; the database is healthy and was not recreated, modified, or accessed for credentials.
- **Remote/CI:** Core PR #4 head and `origin/automation/phase1` were verified at `882a7dc31cbcb93adbbfe54c4159724f91e60e60`. Validate Core run `32790095448` passed every required step, including isolated PostgreSQL integration, current migration identity, image scans, SBOM, and Compose smoke. Template PR #10 remains green at `ec5bcc16517809acce74a1b876dc105c50f3f431`.
- **Remaining accepted auth gate:** host-controlled recovery. Provider and user-facing recovery details require selection of an approved host-managed delivery channel; do not access or change credentials to infer it.
- **Historical audit:** remains **FAIL** until host-controlled recovery and all accepted gates pass.

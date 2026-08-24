# Phase 1 builder status

**Checkpoint:** `a30dc896ebc1867b8c9a7ccecba41162e47bab0d` — `fix(security): require exact request origin scheme`

- **Delivered:** Origin validation now compares the complete effective request origin: scheme, host, and port. A valid CSRF token no longer permits an opposite-scheme `Origin` for the same host. Existing per-client login throttling, server-side logout invalidation, 30-day idle/90-day absolute session lifetimes, Argon2id credentials, password policy, immutable Packs, and owner isolation remain intact.
- **Validation:** focused auth/SQL suite passed (9 tests); `npm run check` passed (105 portable tests); deterministic build passed (25 artifacts); production audit found 0 vulnerabilities; production image `watch-tracker:verify` built successfully.
- **Live:** only the app service was recreated from image `sha256:7c458537e267d14d1521e4bd92dd9e5a7ce0005261a7d65cffcc921a1064db41`; the database container/volume and credentials were unchanged. App and database are healthy; `http://10.18.0.201:3100/ready` returns ready.
- **Runtime proof:** with the public bootstrap CSRF token, `Origin: https://10.18.0.201:3100` against the HTTP deployment returned `403 csrf.invalid`; the exact `Origin: http://10.18.0.201:3100` passed CSRF/origin validation and reached the already-complete setup guard (`409 setup.unavailable`). No credential was read or changed. The prior cross-browser app matrix remains the accepted UI proof; this bounded change is API-only.
- **Remote/CI:** local checkpoint is ready to push; remote-SHA verification and fresh Validate Core are required.
- **Remaining accepted auth gate:** host-controlled recovery. Provider and UX delivery details require the host delivery channel to be specified; do not access or change credentials to infer it.
- **Historical audit:** remains **FAIL** until host-controlled recovery and all accepted gates pass.

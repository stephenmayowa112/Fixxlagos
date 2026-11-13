# Fix Lagos — Operations & Developer Runbook

## 1. Local Development Quickstart

### Option A: Web & Local API Workspace (Default Port 3000)
```bash
npm install
npm run dev
```
- Citizen PWA, Agency Dashboard, Moderator Console, and Transparency Portal: `http://localhost:3000`
- REST API v1 endpoints: `http://localhost:3000/api/v1/*`
- OpenAPI 3.1 schema: `http://localhost:3000/api/v1/schema`

### Option B: Full Docker Compose Stack (PostGIS, Redis, MinIO, Mailpit, Django API)
```bash
docker compose -f infra/docker-compose.yml up -d
```
- PostgreSQL 16 + PostGIS 3.4: `localhost:5432`
- Redis 7: `localhost:6379`
- MinIO S3 API: `http://localhost:9000` (Console: `http://localhost:9001`)
- Mailpit SMTP/UI: `http://localhost:8025`
- Django REST API: `http://localhost:8000/api/v1/`

## 2. Running Verification, Linting & Tests

```bash
# 1. Full automated test suite (26 tests across Phases 0–4: domain, OTP/EXIF, spatial routing/LASRRA, agency/moderation/transparency, and OWASP/backup/NDPA)
npx --yes tsx --test lib/domain.test.ts lib/phase1.test.ts lib/phase2.test.ts lib/phase3.test.ts lib/phase4.test.ts

# 2. TypeScript & ESLint check
npm run lint

# 3. Production Next.js build verification
npm run build
```

## 3. Feature Flags (`lib/feature-flags.ts` & Environment)
| Flag | Default (MVP) | Description |
| :--- | :--- | :--- |
| `FF_SMS_PROVIDER` | `console_fake` | Uses local fake SMS tray in development; switch to Nigerian SMS aggregator in production. |
| `FF_VIDEO_UPLOAD` | `true` | Enables optional ≤ 5 MB, ≤ 15 s video attachment with non-blocking background upload (`REP-05`). |
| `FF_LASRRA_OFFICIAL_VERIFY` | `false` | Phase 2 state lookup (`LRS-05`). Must remain `false` in MVP so status never exceeds `ID provided` (`LRS-04`). |
| `FF_LOW_DATA_DEFAULT` | `false` | Remembers user toggle in `localStorage` (`MAP-05`). |

## 4. Incident & Privacy Procedures (NDPA 2023)
- **Account Deletion (`ACC-04`, `LRS-12`)**: Calling `DELETE /api/v1/me` immediately erases encrypted phone number, display name, LASRRA ID cipher/hash, and card photo keys, while retaining anonymized infrastructure report records (`reporter_id = null`) so public repair tracking is unaffected.
- **Unrouted Reports (`RTE-03`)**: Any report where `area_id` or `road_owner` lacks an active `RoutingRule` is placed in the Moderator `unrouted` queue (`MOD-01`) and highlighted for manual assignment within 1 minute.
- **Emergency Misuse (`Section 2.3`, `REP-06`)**: Fix Lagos does not dispatch emergency responders. Whenever a user toggles **"This is dangerous"** (`REP-06`), the UI immediately displays the Lagos / National Emergency number **112** and safety guidance.

## 5. Pitch Demo Script & 90-Day Pilot Readiness (`PRD Section 14`)
1. **Citizen <60s Camera-First Report (`Section 5.1`)**: Tap the raised amber **Report** button -> select photo (EXIF automatically stripped) -> confirm draggable pin in Yaba -> pick **Roads / Pothole** -> review duplicate nudge within 30 m (`REP-07`) -> enter Nigerian mobile number & 6-digit OTP at submit (`ACC-01`) -> view non-guessable reference ID (`FL-XXXXX`) and optional skippable LASRRA screen (`LRS-01`).
2. **Offline Resilience (`REP-08`)**: Toggle **Offline (Test Drafts)** -> submit a report -> verify it saves in IndexedDB as `"Waiting to send"` -> click **Sync draft(s)** -> verify upload completes with `Idempotency-Key` deduplication.
3. **Agency Triage & Closing Proof (`Section 5.4`, `AGD-01..05`)**: Open **Agency Queue** -> filter or switch between **Table view** and **Map view** -> run Supervisor **Bulk Acknowledge** -> select a report and click **3. Upload repair photo & Mark Fixed** -> verify SMS notification (`NOT-05`).
4. **Community 200 m Fix Verification (`Section 5.3`, `CNF-02`)**: Open a `Fixed` report (`FL-8M2P9`) -> tap **Yes, it’s fixed** within 200 m -> verify transition to **Verified** (`#0F5132`).
5. **Public Transparency & SSR Share Card (`TRN-01..02`)**: Open **Transparency** or `/r/FL-4K7Q2` -> inspect factual agency SLA metrics and shareable preview card with zero personal data or official names.

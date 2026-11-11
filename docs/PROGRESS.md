# Fix Lagos — Build Progress & Phase Tracker

## Phase 0: Repository Foundation, Architecture & Design System Tokens (Approved)
| Task | PRD Requirement IDs | Status |
| :--- | :--- | :--- |
| Monorepo layout (`apps/api`, `apps/web`, `packages/tokens`, `packages/api-client`, `infra/`, `docs/`, `.github/workflows`) | Section 8, Section 9 | Completed |
| Canonical PRD, Decisions, Assumptions, Architecture & Runbook docs | Source of Truth Rules | Completed |
| Design Tokens package (`@fix-lagos/tokens`) & WCAG 2.2 AA contrast verification | Section 10.1–10.8 | Completed |

---

## Phase 1: Identity and Reporting Core (Approved)
| Slice | Task Description | PRD Requirement IDs | Status |
| :--- | :--- | :--- | :--- |
| **1.1** | Nigerian mobile OTP authentication service behind `SmsGateway` interface with `ConsoleSmsFake` (6-digit code, 10-min TTL, 30-sec resend cooldown, AES-256-GCM phone encryption + HMAC-SHA256 lookup hash, short-lived access token + refresh cookie) | `ACC-01`, `Section 12` | Completed |
| **1.2** | Unauthenticated public browsing, server-side RBAC (`citizen`, `agency_officer`, `agency_supervisor`, `moderator`, `super_admin`), anonymous-by-default display with first-name opt-in, NDPA 2023 account deletion/anonymisation, and invitation-only Agency Staff Email + Password + RFC 6238 TOTP 2FA | `ACC-02`, `ACC-03`, `ACC-04`, `ACC-05`, `ACC-06` | Completed |
| **1.3** | Presigned resumable media upload service (`/api/v1/media/uploads`, `/api/v1/media/uploads/{id}/complete`), binary EXIF/GPS segment stripper (`REP-11`) with WebP/JPEG output, and non-blocking video validation (`<= 5 MB`, `<= 15 s`) & Celery H.264 transcoding task (`REP-05`) | `REP-01`, `REP-05`, `REP-11` | Completed |
| **1.4** | Report creation engine (`/api/v1/reports`, `/api/v1/reports/similar`, `/api/v1/me/reports`) with PostGIS point & accuracy validation (`>100m` requires manual pin), 4 categories & sub-categories, 280-char note, dangerous toggle (`112`), 30m duplicate nudge, `Idempotency-Key` deduplication, `FL-XXXXX` reference ID, and configurable 10/day rate limit | `REP-02`, `REP-03`, `REP-04`, `REP-06`, `REP-07`, `REP-08`, `REP-09`, `REP-10`, `REP-12` | Completed |
| **1.5** | Camera-first report UI flow (`<60s`), interactive draggable location pin on map, 2×2 category tiles, progressive OTP modal at submit, resumable video attachment with non-blocking failure fallback, IndexedDB `"Waiting to send"` offline drafts with reconnect auto-sync, and My Reports list | `Section 5.1`, `Section 5.2`, `REP-01..12`, `ACC-01..06` | Completed |
| **1.6** | Automated Phase 1 test suite verifying PRD Section 15 Acceptance Criteria 1 & 2, binary EXIF stripping, OTP expiry/cooldown, RBAC, TOTP 2FA, rate limiting, and non-blocking video failure | `Section 15 (AC-1, AC-2)`, `REP-11`, `ACC-01..06` | Completed |

---

## Phase 2: Map, Feed, Routing, Confirmations & Optional LASRRA Verification (Approved)
| Slice | Task Description | PRD Requirement IDs | Status |
| :--- | :--- | :--- | :--- |
| **2.1** | Spatial Map & Feed Engine: clustered map pins by status (`MAP-01`), list view with nearest/newest/priority sort & category/status/area filters (`MAP-02`), default 2 km "Near me" radius (`MAP-03`), vector tile fallback to list (`MAP-04`), and persistent Low-Data Mode (`MAP-05`) | `MAP-01`, `MAP-02`, `MAP-03`, `MAP-04`, `MAP-05` | Completed |
| **2.2** | Spatial Jurisdiction Routing Engine (`RTE-01..05`): agency registry, routing rule matcher (`category + polygon + road_owner`), automatic fallback to Moderator Triage Queue within 1 minute (`RTE-03`), logged moderator reassignment (`RTE-04`), and agency "Not our responsibility" return (`RTE-05`) | `RTE-01`, `RTE-02`, `RTE-03`, `RTE-04`, `RTE-05` | Completed |
| **2.3** | Duplicate Nudge (`REP-07` / `GET /api/v1/reports/similar`) & Community Confirmations (`CNF-01..03` / `POST /api/v1/reports/[ref]/confirmations`): one confirmation per user per report, Priority Score recalculation (`6.9`), and 200 m community fix verification (`2 Yes -> Verified`, `7 days -> Verified`, `1 No -> Agency Review`, `2 Nos -> Reopened at higher priority`) | `REP-07`, `CNF-01`, `CNF-02`, `CNF-03`, `STA-01`, `STA-04`, `Section 5.3` | Completed |
| **2.4** | Optional LASRRA Resident Verification Vault (`LRS-01..13`): voluntary ID + optional private card photo upload with NDPA 2023 consent (`LRS-13`), AES-256-GCM encryption + unique HMAC-SHA256 hash (`LRS-08`, `LRS-09`), equal routing/priority/display (`LRS-06`, `LRS-07`), moderator plausibility review keeping `ID provided` badge (`LRS-04`), immutable audit log on every view (`LRS-10`), auto-deletion of card photo after review (`LRS-12`), and strict redaction on public & agency API responses (`LRS-11`) | `LRS-01` to `LRS-13` | Completed |
| **2.5** | Automated Phase 2 Acceptance Test Suite (`lib/phase2.test.ts` & `apps/api/tests/test_phase2.py`) verifying PRD Section 15 `AC-3`, `AC-4`, `AC-5`, `AC-6`, `AC-9`, and `AC-10` | `Section 15 (AC-3..6, AC-9..10)` | Completed |

---

## Phase 3: Agency Triage Dashboard, Notifications, Moderation/Admin Console & Public Transparency Page (Current Phase)
| Slice | Task Description | PRD Requirement IDs | Status |
| :--- | :--- | :--- | :--- |
| **3.1** | Agency Triage Dashboard & Queue Engine (`GET/POST /api/v1/agency/queue`, `POST /api/v1/agency/reports/[ref]/status`): priority-sorted queue with status/category/area/severity/overdue/resident-badge filters (`AGD-01`, `LRS-06`), Table & Map view switcher + CSV export (`AGD-02`), unit assignment, status transitions, repair photo proof, required public rejection reason (`STA-02`), `"Not our responsibility"` return (`RTE-05`), and Supervisor Bulk Actions with RBAC & audit trail (`AGD-05`) | `AGD-01`, `AGD-02`, `AGD-03`, `AGD-05`, `STA-01`, `STA-02`, `STA-03`, `RTE-05` | Completed |
| **3.2** | Agency Analytics Engine (`GET /api/v1/agency/analytics`): reports by category and area, median time to acknowledge and fix, 7-day SLA overdue count (`STA-03`), hotspot street rankings, and monthly pilot trend | `AGD-04`, `STA-03` | Completed |
| **3.3** | Citizen & Agency Notifications (`GET /api/v1/me/notifications`, `PATCH /api/v1/me/settings`): concise `<=160` char SMS with ref ID, agency, and short link (`NOT-05`), user SMS opt-out (`NOT-01`), PWA Web Push & in-app inbox (`NOT-02`), 9pm–7am WAT quiet hours queuing (`NOT-04`), and immediate dangerous hazard alerts + daily agency email digest (`NOT-03`) | `NOT-01`, `NOT-02`, `NOT-03`, `NOT-04`, `NOT-05` | Completed |
| **3.4** | Moderation & Live Admin Console (`POST /api/v1/reports/[ref]/flags`, `GET/POST/PUT /api/v1/admin/routing-rules`): new-user pre-moderation gate (`<3` verified reports held for review; `3+` auto-published, `Section 5.5`), citizen flagging (`MOD-02`), duplicate merge into oldest parent (`MOD-03`), user rate-limit/ban & content hiding (`MOD-04`), and live Routing Rule CRUD without code changes (`MOD-05`, `RTE-02`) | `MOD-01`, `MOD-02`, `MOD-03`, `MOD-04`, `MOD-05`, `RTE-02`, `Section 5.5` | Completed |
| **3.5** | Public Transparency Scorecard, SSR Shareable Preview Cards & Zero-PII Analytics (`GET /api/v1/public/areas/[id]/summary`, `/r/[ref]`): per-area status counts, factual agency response table (zero individual official names), interactive area map (`TRN-01`), OpenGraph/SVG shareable preview cards (`TRN-02`), privacy-safe analytics funnel (`Section 13`), and automated Phase 3 test suite (`lib/phase3.test.ts` & `apps/api/tests/test_phase3.py`) | `TRN-01`, `TRN-02`, `Section 13`, `Section 15` | Completed |

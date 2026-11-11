# Fix Lagos — System Architecture

## 1. High-Level Topology

```
+-------------------------------------------------------------------------+
| Citizen & Agency PWA (Next.js App Router, TypeScript, Tailwind Tokens)  |
| - Camera-first <60s report wizard + client-side canvas EXIF stripper    |
| - IndexedDB (`idb`) offline draft queue with exponential backoff        |
| - Workbox / Service Worker offline asset & tile caching                 |
+------------------------------------+------------------------------------+
                                     | HTTPS / JSON (/api/v1)
                                     | Header: Idempotency-Key
                                     v
+-------------------------------------------------------------------------+
| API Layer (`apps/api` Django 5 + DRF / Next.js `/api/v1` Edge Bridge)   |
| - OpenAPI 3.1 contract (`packages/api-client/openapi.yaml`)             |
| - Role RBAC (citizen, agency_officer, agency_supervisor, moderator,     |
|   super_admin) + Rate limiting (10 reports/user/day, REP-10)            |
| - Spatial routing engine (Category + Jurisdiction Polygon + Road Owner) |
| - Priority score calculator: severity*10 + min(confirms,20)*2 + days*0.5|
+-----------------+------------------+------------------+-----------------+
                  |                  |                  |
                  v                  v                  v
      +-------------------+  +---------------+  +-------------------------+
      | PostgreSQL 16 +   |  | Redis 7 +     |  | S3 / MinIO Object Store |
      | PostGIS 3.4       |  | Celery Worker |  | - `private-originals`   |
      | - GiST index on   |  | - EXIF strip  |  | - `public-media` (WebP) |
      |   Report.location |  | - ffmpeg H264 |  | - `private-lasrra-id`   |
      | - AES-256 PII     |  | - SMS / Email |  |   (auto-deleted post    |
      | - Immutable Audit |  | - 7d SLA cron |  |    moderator review)    |
      +-------------------+  +---------------+  +-------------------------+
```

## 2. Repository Structure (Monorepo)

- `apps/api/`: Python 3.12, Django 5.1, Django REST Framework, PostGIS models (`User`, `Agency`, `JurisdictionArea`, `Category`, `RoutingRule`, `Report`, `ReportMedia`, `StatusEvent`, `Confirmation`, `Flag`, `Notification`, `AuditLog`, `ResidentVerification`), Celery tasks, and `pytest` suite.
- `apps/web/` & root `/app`: Next.js 15 App Router frontend consuming `@fix-lagos/tokens` and `@fix-lagos/api-client`.
- `packages/tokens/`: Design system tokens (PRD Section 10 colours, status badges with icons, typography scales, spacing, elevation, and WCAG 2.2 AA contrast validator).
- `packages/api-client/`: OpenAPI 3.1 specification (`openapi.yaml`) and strongly typed TypeScript client with Zod schemas.
- `infra/`: `docker-compose.yml` (PostGIS, Redis, MinIO, Mailpit) and Terraform cloud modules (`infra/terraform/main.tf`).
- `docs/`: `PRD.md`, `DECISIONS.md`, `ASSUMPTIONS.md`, `ARCHITECTURE.md`, `RUNBOOK.md`, `PROGRESS.md`.

## 3. Privacy, Security & Equal-Treatment Guarantees

1. **Equal Treatment (`LRS-07`)**: The routing engine (`resolveRoutingRule`) and priority calculator (`calculatePriorityScore`) never take `resident_status` or `lasrra_id` as an input weight. Reports with or without a LASRRA ID follow the exact same routing, SLA timer, and public timeline lifecycle.
2. **NDPA 2023 Data Minimisation (`Section 12`, `LRS-08`–`LRS-13`)**:
   - Phone numbers and LASRRA IDs are encrypted at rest and indexed only via keyed SHA-256 hashes.
   - Public API responses strip reporter phone numbers, raw GPS EXIF tags, and LASRRA ID strings.
   - Every moderator access to `ResidentVerification` or `User` PII writes an immutable `AuditLog` entry.
3. **Resilient Offline Submission (`REP-08`)**:
   - Reports created while offline are persisted in IndexedDB store `fix_lagos_drafts` with status `"Waiting to send"` and a UUIDv4 `idempotencyKey`.
   - When connectivity returns, drafts replay against `POST /api/v1/reports` with `Idempotency-Key`, preventing duplicate creation on flaky 3G retries.

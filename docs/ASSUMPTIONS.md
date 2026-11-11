# Fix Lagos — Explicit Assumptions & Placeholder Registry

Per Working Rules, no real-world facts (agency names, jurisdiction boundaries, road ownership, third-party credentials, or LASRRA API formats) are invented. All seed records and integrations below are explicitly marked as **SAMPLE / PLACEHOLDER DATA** until confirmed with the pilot council and state authorities.

## 1. Pilot Council & Jurisdiction Boundaries (PRD Open Question #1 & #2)
- **Pilot Areas (Sample)**:
  - `area-yaba-sample`: **Yaba LCDA (Sample Pilot Boundary)** — bounding box `[6.495, 3.365, 6.530, 3.395]`
  - `area-surulere-sample`: **Surulere LGA (Sample Pilot Boundary)** — bounding box `[6.475, 3.335, 6.515, 3.370]`
  - `area-ikeja-sample`: **Ikeja LGA (Sample Boundary)** — bounding box `[6.575, 3.330, 6.620, 3.375]`
- **Road Ownership Layer**: Sample road segments are tagged `state`, `local`, `federal`, or `unknown`. Any report on an `unknown` road owner routes automatically to the Moderator Triage Queue (`RTE-03`).

## 2. Placeholder Agencies (PRD Section 6.4 `RTE-01`)
All agency records are suffixed with `(Sample Pilot Agency)` in seed fixtures so they are never mistaken for live government commitments:
1. `agency-roads-sample`: **Lagos Roads Maintenance Team (Sample Pilot Agency)** — Categories: `Roads` · SLA Target: `7 days`
2. `agency-lights-sample`: **Street Lighting & Power Unit (Sample Pilot Agency)** — Categories: `Street lights` · SLA Target: `7 days`
3. `agency-drainage-sample`: **Drainage & Flood Control Office (Sample Pilot Agency)** — Categories: `Drainage and flooding` · SLA Target: `7 days`

## 3. LASRRA ID Integration & Format (`LRS-01` – `LRS-13`)
- **Official API Status**: Not integrated in MVP (`LRS-04`). `FF_LASRRA_OFFICIAL_VERIFY=false`.
- **Format Validation**: Because exact LASRRA alphanumeric format rules must be confirmed with LASRRA before strict regex validation (`PRD Section 6.13 Risks`), MVP accepts plausible alphanumeric strings of 8–20 characters, encrypts at rest, stores a salted SHA-256 hash (`id_number_hash`), and assigns at most `ID provided` (`#1D5FA8`). Nothing in the MVP awards `Verified resident` automatically.

## 4. Third-Party Services & Local Fakes (Working Rule #6 & #7)
- **SMS Aggregator (`NOT-01`, `ACC-01`)**: Behind `SmsGateway` interface. Local development uses `ConsoleAndInboxSmsFake` which delivers 6-digit OTPs (`123456` accepted in local dev/demo mode alongside dynamically generated codes) and status SMS alerts directly to the local simulated SMS tray and server log.
- **Object Storage (`REP-01`, `REP-05`, `LRS-09`)**: Behind `MediaStorageGateway` interface. Uses MinIO (`http://localhost:9000`) in `docker-compose` and an in-memory/IndexedDB data-URL store in browser preview mode, separating public EXIF-stripped report media from private LASRRA card storage.

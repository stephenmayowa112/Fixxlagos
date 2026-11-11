# Fix Lagos: Product Requirements Document

*Version 1.0 · 8 November 2026 · Owner: Stephen Mayowa Ojunde, Founder · Status: Draft for build*

## 1. Purpose and how to use this document

This is the build specification for the Fix Lagos MVP and the two phases after it. It tells a developer what to build, why each decision was made, and how the product should look and behave on every screen size. Figures such as pilot targets and performance budgets are projections to validate, not measured results. Requirement IDs (for example REP-03) are for ticketing and testing.

## 2. Product overview

**Fix Lagos** is a mobile-first web app (PWA) where citizens report broken public infrastructure in Lagos, starting with roads, street lights and drainage. Each report carries a geotagged photo, a short note and an optional short video. The platform routes it to the responsible agency, shows a public status trail, and lets nearby citizens confirm that a fix really happened.

*Tagline: Report it. Route it. Track it until it’s fixed.*

### 2.1 Problem
- Citizens do not know which agency owns a fault.
- Reports vanish into calls and social posts, with no status and no proof of repair.
- Agencies lack structured data on hotspots, repeat faults and response times.

### 2.2 Goals
1. Reporting takes under 60 seconds on a mid-range Android phone on a weak network.
2. Every report reaches the right agency or a human triager.
3. Every report has a visible status and a closing proof.
4. Agencies get a dashboard they would choose to use.

### 2.3 Non-goals for the MVP
Payments; emergencies such as crime, fire or medical cases (show the national emergency number 112 instead); private property disputes; native iOS and Android apps; chat between citizens and agencies; AI image classification (a Phase 2 candidate).

### 2.4 Pilot success metrics (projections to validate)
- 2,000 registered citizens and 1,500 reports in the 90-day pilot
- 60% of reports acknowledged by an agency within 7 days
- Report completion rate (start to submit) above 80%
- Median time to submit under 60 seconds
- 30% of reporters file a second report
- Each pilot agency logs in at least weekly

## 3. Users
- **Citizen reporter (Ada, 29, commuter)**: mid-range Android, prepaid data. Wants to report fast and hates sign-up friction and data cost.
- **Community verifier (Mr Bello, 52, shop owner on the street)**: gets asked whether a claimed fix is real and confirms or disputes it.
- **Agency officer**: triages the queue, updates status, uploads a repair photo.
- **Agency supervisor**: sees performance, hotspots and overdue items.
- **Fix Lagos moderator or admin**: moderates content, manages agencies, routing rules and users.

## 4. Scope by phase

**MVP (pitch demo and 90-day pilot)**: phone OTP sign-in with optional LASRRA ID entry; report creation (photos, location, category, note, optional video); duplicate nudge; map and feed; routing to agencies; status trail; SMS and in-app notifications; citizen confirmation of fixes; agency dashboard; moderation tools; public transparency page; PWA with offline drafts; English.

**Phase 2**: government service reporting and scorecards; official LASRRA ID verification and a Verified resident badge; Nigerian Pidgin; WhatsApp channel; AI-assisted category suggestion; automatic blurring of faces and number plates; dark mode; paid analytics tier.

**Phase 3**: more states; open data API; estate and corporate partners; Yoruba, Hausa and Igbo.

## 5. Core user flows

### 5.1 Report an issue
1. Tap the centre Report button. The camera opens immediately (file picker if camera is denied).
2. Take or choose 1 to 3 photos. Location is read automatically and shown as a draggable pin on a small map.
3. Pick a category from large tiles. Optionally add a note (280 characters) and one video (max 5 MB, 15 seconds).
4. If a similar open report exists within 30 m, show it: “Same problem? Confirm it instead.”
5. Review and send. If signed out, ask for phone number and OTP now, not earlier, then submit automatically.
6. Success screen: reference ID, what happens next, and a share button.

Offline: the report is saved as a draft, labelled “Waiting to send”, and uploads when the connection returns.

### 5.2 Track
My Reports lists reports with status badges. The detail page shows the timeline, responsible agency, last update time and photos.

### 5.3 Confirm a fix
When an agency marks a report Fixed, the reporter and confirmers within 200 m are asked: “Is it fixed?” (Yes, No, Not sure, optional photo). A report becomes Verified after 2 Yes answers or after 7 days with no dispute. One No sends it back for agency review; two Nos reopen it automatically.

### 5.4 Agency triage
Queue sorted by priority score; open a report; accept or reject with a reason from a list; assign to staff; update status; add a note and a repair photo; mark Fixed.

### 5.5 Moderation
Reports from new users are reviewed before publishing (target: within 2 hours in working hours). Users with 3 or more verified reports are published automatically. Moderators flag and remove abusive content, merge duplicates and reassign mis-routed reports.

## 6. Functional requirements

### 6.1 Accounts and access (ACC)
- **ACC-01** Sign in with a Nigerian mobile number and 6-digit SMS OTP (valid 10 minutes, resend after 30 seconds). Email is optional.
- **ACC-02** Browsing the map and reports needs no account.
- **ACC-03** Roles: citizen, agency officer, agency supervisor, moderator, super admin, enforced server-side.
- **ACC-04** Users can delete their account; personal data is erased or anonymised (Section 12).
- **ACC-05** Public display is anonymous by default; users can opt in to show a first name.
- **ACC-06** Agency staff accounts are invitation-only with email, password and TOTP two-factor authentication.

### 6.2 Report creation (REP)
- **REP-01** 1 to 3 photos, compressed on device to a 1600px long edge and about 800 KB each before upload.
- **REP-02** Location from the browser with accuracy shown. If accuracy is worse than 100 m or permission is denied, require manual pin placement. Store latitude, longitude and accuracy.
- **REP-03** Categories: Roads (pothole, collapsed road, missing manhole cover, blocked road); Street lights (not working, flickering, damaged pole, exposed wires); Drainage and flooding (blocked drain, overflow, open drain, flooded road); Other public infrastructure (moderator re-categorises).
- **REP-04** Optional note, up to 280 characters.
- **REP-05** Optional single video, max 5 MB and 15 seconds. Compress on device where supported, verify and transcode on the server to MP4 (H.264). Upload is resumable and never blocks submission: if it fails, the report goes without the video and the video retries in the background.
- **REP-06** A “This is dangerous” toggle (open manhole, exposed wires) raises priority and shows safety tips and the 112 number. Agencies set the final severity.
- **REP-07** Duplicate nudge: before submit, show up to 3 open reports of the same category within 30 m; the user can confirm one instead of creating a new report.
- **REP-08** Offline drafts stored in IndexedDB with retry and exponential backoff. An idempotency key on creation prevents duplicates when retries happen.
- **REP-09** Reference ID such as FL-4K7Q2 (non-guessable).
- **REP-10** Rate limit of 10 reports per user per day (adjustable).
- **REP-11** EXIF data is stripped from public copies of photos; original coordinates stay in the database only.
- **REP-12** A short banner reminds users to photograph from a safe place, away from traffic, and to avoid faces and number plates.

### 6.3 Map and feed (MAP)
- **MAP-01** Home shows a map with clustered pins coloured by status. Tapping a pin opens a bottom sheet (mobile) or side panel (desktop).
- **MAP-02** List view alternative, sorted by nearest or newest, with filters for category, status and area.
- **MAP-03** Default “near me” radius of 2 km.
- **MAP-04** MapLibre GL with OpenStreetMap-based vector tiles, cached for the pilot area. If tiles fail, fall back to the list.
- **MAP-05** Low-data mode: thumbnails only, no autoplay, lighter map. The setting is remembered.

### 6.4 Routing (RTE)
- **RTE-01** Agency registry: name, type, jurisdiction polygons, contacts, categories handled. Pilot agencies (roads, street lighting, drainage or environment) are confirmed with the pilot council during onboarding.
- **RTE-02** Routing rule: category + jurisdiction polygon + road owner (state, federal, local, unknown) gives the agency. Admins edit rules without code changes.
- **RTE-03** If no rule matches or road ownership is unknown, the report goes to the moderator triage queue. It is never dropped.
- **RTE-04** Moderators can reassign; every reassignment is logged.
- **RTE-05** Agencies can reject with “not our responsibility” and suggest another agency; the report returns to a moderator.

### 6.5 Status lifecycle (STA)
Citizen-facing statuses: **Reported, Acknowledged, In progress, Fixed, Verified**. Internal extras: Pending review, Rejected (with reason), Duplicate, Reopened.
- **STA-01** Every change creates an immutable status event with actor, time, note and optional photo.
- **STA-02** Rejections require a reason, shown publicly.
- **STA-03** Time-to-acknowledge target is 7 days (configurable per agency). Overdue items are highlighted in the agency queue and on the transparency page.
- **STA-04** Reopened reports re-enter the queue at higher priority.

### 6.6 Confirmations (CNF)
- **CNF-01** Any signed-in user can add “I see this too” to an open report. It counts towards priority.
- **CNF-02** Fix verification follows Section 5.3. Only the reporter and users within 200 m, checked at the time, can verify.
- **CNF-03** One confirmation per user per report.

### 6.7 Notifications (NOT)
- **NOT-01** SMS is the default channel for Acknowledged, Fixed and Reopened, because many users have no data. Users can switch it off.
- **NOT-02** PWA push and an in-app inbox.
- **NOT-03** Agencies get a daily email digest and an immediate alert for dangerous reports.
- **NOT-04** Quiet hours 9pm to 7am for non-urgent messages.
- **NOT-05** SMS text is short, names the reference ID and the agency, and carries a short link.

### 6.8 Agency dashboard (AGD)
- **AGD-01** Queue with filters (status, category, area, severity, overdue) sorted by priority score.
- **AGD-02** Map and table views with CSV export.
- **AGD-03** Report detail actions: acknowledge, assign, update status, add note, upload repair photo, reject with reason.
- **AGD-04** Analytics: reports by category and area, median time to acknowledge and to fix, overdue count, hotspot heatmap, monthly trend.
- **AGD-05** Bulk actions for supervisors and a full audit trail.

### 6.9 Priority score
`Priority = severity weight (low 1, medium 2, high 3, dangerous 5) × 10 + min(confirmations, 20) × 2 + days open × 0.5`. These are starting values to tune with pilot data.

### 6.10 Moderation and admin (MOD)
- **MOD-01** Queues for pending, flagged and unrouted reports.
- **MOD-02** Any user can flag a report (not infrastructure, abusive, personal data, spam).
- **MOD-03** Merge duplicates: the oldest report becomes the parent and confirmations move across.
- **MOD-04** Rate-limit or ban users; hide content.
- **MOD-05** Admin console for agencies, categories, routing rules, jurisdiction polygons and settings.

### 6.11 Public transparency page (TRN)
- **TRN-01** Public page per area showing counts by status, median response time per agency and a map. Performance is shown factually; individual officers are never named.
- **TRN-02** Shareable preview images for reports and area summaries.

### 6.12 Government service reporting (Phase 2, GSV)
Citizens report on services such as a permit office or a public health centre: service type, location, date, 1 to 5 rating, a few structured questions and a short note. Results aggregate into service scorecards for agencies and the public under the same moderation and privacy rules. To be specified in detail after the pilot.

### 6.13 Optional LASRRA ID and resident status (LRS)
Lagos residents hold a LASRRA (Lagos State Residents Registration Agency) registration. Fix Lagos lets users add their LASRRA ID voluntarily, so agencies can see which reports come from registered residents. It is optional at launch and must never block a report.
- **LRS-01** At sign-up and later in Profile, show an optional field: “Add your LASRRA ID (optional)”, with one line of why: “Reports from registered residents carry more weight with agencies.”
- **LRS-02** Users can enter the ID number and optionally upload a photo of the card. Skipping never blocks sign-up or reporting.
- **LRS-03** Resident status shown on a user’s reports: **No ID** (default, nothing shown), **ID provided** (number entered, not yet officially checked), **Verified resident** (confirmed against official records).
- **LRS-04** MVP: a moderator reviews the number and card photo for obvious problems. This confirms plausibility, not authenticity, so the status stays **ID provided**. Nothing in the product says “verified” until an official check exists.
- **LRS-05** After state approval (Phase 2): verify against LASRRA records through a lookup or integration agreed with LASRRA, then award **Verified resident**.
- **LRS-06** Agencies see the status on each report and can filter and sort the queue by it. In the MVP it does not change the priority score; revisit with pilot data and agency feedback.
- **LRS-07** Routing, visibility and status updates are identical for all reports, with or without an ID. Making the ID compulsory is out of scope.
- **LRS-08** ResidentVerification record: `id, user_id, id_number (encrypted), id_number_hash, card_photo_key (nullable), status (none, provided, verified, rejected), verified_via (manual, lasrra_check), reviewed_by, reviewed_at, created_at`.
- **LRS-09** The hash prevents one ID from backing two accounts. Card photos go to private storage separate from report media and are never public.
- **LRS-10** Only moderators with the verification role, and the verification service, can see ID data. Every view is written to the audit log.
- **LRS-11** The ID number and card photo are never shown publicly or to agencies. Agencies see only the status badge.
- **LRS-12** Delete the card photo once review finishes, keeping the status and the hash. Delete everything on account deletion.
- **LRS-13** Show a clear consent tick-box and plain-language notice (what is stored, why, who sees it). A government-issued ID is sensitive, so get legal review under the Nigeria Data Protection Act 2023 before launch.

## 7. Data model (PostgreSQL + PostGIS)
- **User**: `id, phone (encrypted, with a hash for lookup), display_name, public_name_opt_in, role, trust_level, resident_status, created_at, deleted_at`.
- **Agency**: `id, name, type, contact_email, sla_ack_days, active`. **AgencyUser**: `user_id, agency_id, role`.
- **JurisdictionArea**: `id, name, level (state, LGA, LCDA, ward), geometry (MultiPolygon)`.
- **Category**: `id, parent_id, name, icon, default_severity, active`.
- **RoutingRule**: `id, category_id, area_id, road_owner, agency_id, priority`.
- **Report**: `id, ref_code, reporter_id (nullable), category_id, note, location (geography point), accuracy_m, area_id, severity, is_dangerous, status, agency_id, duplicate_of_id, confirmation_count, priority_score, created_at, acknowledged_at, fixed_at, verified_at`.
- **ReportMedia**: `id, report_id, type, original_key, public_key, size_bytes, width, height, duration_s, status`.
- **StatusEvent**: `id, report_id, from_status, to_status, actor_id, note, media_id, created_at`.
- **Confirmation**: `id, report_id, user_id, kind (see_too, fix_yes, fix_no, fix_unsure), distance_m, created_at`.
- **Flag, Notification, AuditLog**: standard records of who did what, when, and what was sent.

Key indexes: GiST on `Report.location`; `(status, agency_id, priority_score)`; `(category_id, created_at)`.

## 8. Architecture and tech stack
- **Frontend**: Next.js (TypeScript) PWA with a service worker (Workbox), Tailwind CSS driven by the tokens in Section 10, MapLibre GL JS, IndexedDB for offline drafts. Public report and area pages are server-rendered for link previews and search.
- **Backend**: Django and Django REST Framework, PostGIS for geospatial queries, Celery with Redis for background jobs (media processing, notifications, SLA checks, priority recalculation).
- **Storage**: S3-compatible object storage with presigned, resumable uploads and a CDN. Originals are private; public copies are resized with EXIF removed.
- **Media**: image processing to WebP with JPEG fallback; ffmpeg for video.
- **Notifications**: an SMS aggregator with good Nigerian network coverage, an email service, Web Push. WhatsApp Business API in Phase 2.
- **Auth**: OTP sessions with short-lived tokens and refresh cookies; TOTP for agency staff.
- **Hosting**: Docker containers in a region with low latency to Lagos; managed PostgreSQL with daily backups; staging and production.
- **Quality**: Sentry, structured logs, uptime checks, GitHub Actions CI with tests, linting, type checks and preview deployments.

## 9. API outline (REST, JSON, `/api/v1`)
- **Auth**: `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/refresh`, `/auth/logout`
- **Reports**: `GET /reports` (bbox, near, radius, category, status, area, cursor); `POST /reports`; `GET /reports/{ref}`; `PATCH /reports/{ref}` (agency or moderator); `GET /reports/similar`
- **Engagement**: `POST /reports/{ref}/confirmations`; `POST /reports/{ref}/flags`
- **Media**: `POST /media/uploads` (presigned URL); `POST /media/uploads/{id}/complete`
- **Me**: `GET /me/reports`; `GET /me/notifications`; `PATCH /me/settings`; `DELETE /me`
- **Agency**: `GET /agency/queue`; `POST /agency/reports/{ref}/status`; `GET /agency/analytics`
- **Admin**: CRUD for `/admin/agencies`, `categories`, `routing-rules`, `areas`
- **Public**: `GET /public/areas/{id}/summary`

Conventions: cursor pagination, `Idempotency-Key` header on report creation, one consistent error format.

## 10. Design system and UI/UX rationale
- **Colours**: Ink `#14211E`, Page background `#F7F5EF`, Card `#FFFFFF`, Action amber `#F2B21A`, Primary green `#1F6F57`, Focus/info blue `#1D5FA8`, Error red `#B3261E`, Muted text `#5B6B66`, Border `#DDE3DF`.
- **Status colours** (always paired with an icon and label): Reported `#5B6B66`, Acknowledged `#1D5FA8`, In progress `#9A5A00`, Fixed `#1F6F57`, Verified `#0F5132`, Rejected `#B3261E`.
- **Typography**: Space Grotesk 600/700 (headings, numerals) and Inter 400/600 (body, UI). Scale (mobile/desktop): H1 28/40, H2 22/30, H3 18/22, body 16/17, small 14. Form inputs 16px.
- **Shape & spacing**: 4px unit; 12px radius for buttons/inputs/cards; 16px for bottom sheets; full pills only for status badges and chips; 48px minimum touch targets with 8px gap.
- **Buttons**: Primary amber fill `#F2B21A` with `#14211E` ink text, weight 600, 52px tall; Secondary 2px `#1F6F57` green outline; Destructive `#B3261E` red fill with white text; Focus 3px `#1D5FA8` blue outline with 2px offset.
- **Layout**: Under 360px; 360–599px (bottom tab bar with raised 64px amber Report button); 600–1023px (left rail); 1024–1439px (left rail + 40/60 map/list split); 1440px+ (12-column agency dashboard).

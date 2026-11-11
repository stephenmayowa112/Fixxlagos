import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Phase2EngagementEngine,
  clusterMapReports,
  queryPublicReports,
} from './phase2-core';
import { INITIAL_SAMPLE_REPORTS } from './seed-data';

test('PRD Section 15 Acceptance Criterion 3 (REP-07): Given an open Roads report 15 m away, when a user starts a new Roads report at that spot, then the existing report is suggested for confirmation before submit', () => {
  const engine = new Phase2EngagementEngine(INITIAL_SAMPLE_REPORTS);
  const seedRoad = engine.getReportByRef('FL-4K7Q2')!;

  // Starting a new Roads report ~15 m away from FL-4K7Q2
  const candidates = engine.findSimilarWithin30m(
    'roads',
    seedRoad.lat + 0.0001,
    seedRoad.lng + 0.0001
  );

  assert.ok(candidates.length >= 1 && candidates.length <= 3);
  assert.ok(
    candidates.some((c) => c.report.refCode === 'FL-4K7Q2'),
    'Expected FL-4K7Q2 to be suggested for confirmation within 30 m'
  );
  assert.ok(
    candidates.every((c) => c.distanceM <= 30),
    'All suggested duplicate candidates must be within 30 m'
  );
});

test('PRD Section 15 Acceptance Criterion 4 (RTE-02 & RTE-03): Given a report in an area with a routing rule, it is assigned to the matching agency; given no rule matches, it enters the moderator triage queue', () => {
  const engine = new Phase2EngagementEngine(INITIAL_SAMPLE_REPORTS);

  // 1. Matching routing rule: Drainage in Yaba on state road -> Drainage & Flood Control Office
  const routedReport = engine.createAndRouteReport({
    refCode: 'FL-RTE01',
    userId: 'usr-citizen-a',
    categoryId: 'drainage',
    subCategory: 'Blocked drain',
    note: 'Blocked culvert on Herbert Macaulay Way',
    lat: 6.5112,
    lng: 3.3705,
    accuracyM: 12,
    areaId: 'area-yaba-sample',
    streetLabel: 'Herbert Macaulay Way, Yaba',
    roadOwner: 'state',
    isDangerous: false,
  });

  assert.equal(routedReport.agencyId, 'agency-drainage-sample');
  assert.equal(
    routedReport.agencyName,
    'Drainage & Flood Control Office (Sample Pilot Agency)'
  );

  // 2. Unmatched rule (unknown road owner or federal road) -> Moderator Triage Queue (never dropped)
  const triageReport = engine.createAndRouteReport({
    refCode: 'FL-RTE02',
    userId: 'usr-citizen-a',
    categoryId: 'roads',
    subCategory: 'Collapsed road',
    note: 'Slip road edge collapse where ownership is unknown',
    lat: 6.5965,
    lng: 3.3418,
    accuracyM: 15,
    areaId: 'area-ikeja-sample',
    streetLabel: 'Obafemi Awolowo Way Slip Road, Ikeja',
    roadOwner: 'unknown',
    isDangerous: false,
  });

  assert.equal(triageReport.agencyId, null);
  assert.equal(triageReport.agencyName, 'Moderator Triage Queue');
});

test('PRD Section 15 Acceptance Criteria 5 & 6 (Section 5.3, CNF-02, STA-04): 2 Yes within 200 m verifies a Fixed report; 2 Nos within 200 m reopens it at higher priority', () => {
  // Case A (AC-5): 2 Yes answers within 200 m -> Verified
  const engineYes = new Phase2EngagementEngine(INITIAL_SAMPLE_REPORTS);
  const fixedSeed = engineYes.getReportByRef('FL-8M2P9')!;
  // FL-8M2P9 is currently 'fixed' with fixYesCount = 1
  const secondYes = engineYes.submitConfirmation({
    refCode: 'FL-8M2P9',
    userId: 'usr-verifier-2',
    kind: 'fix_yes',
    userLat: fixedSeed.lat + 0.0001, // ~15 m away (<= 200 m)
    userLng: fixedSeed.lng + 0.0001,
  });

  assert.equal(secondYes.transitionedTo, 'verified');
  assert.equal(secondYes.report.status, 'verified');
  assert.ok(secondYes.report.verifiedAt !== null);

  // Case B (AC-6): 2 No answers within 200 m -> Reopened at higher priority
  const engineNo = new Phase2EngagementEngine(INITIAL_SAMPLE_REPORTS);
  const beforeReport = engineNo.getReportByRef('FL-8M2P9')!;
  const initialPriority = beforeReport.priorityScore;

  // First No -> sent back for agency review
  const firstNo = engineNo.submitConfirmation({
    refCode: 'FL-8M2P9',
    userId: 'usr-disputer-1',
    kind: 'fix_no',
    userLat: beforeReport.lat + 0.0001,
    userLng: beforeReport.lng + 0.0001,
  });
  assert.equal(firstNo.sentBackForAgencyReview, true);
  assert.equal(firstNo.reopenedForAgency, false);

  // Second No -> automatically reopened at higher priority (+15 boost)
  const secondNo = engineNo.submitConfirmation({
    refCode: 'FL-8M2P9',
    userId: 'usr-disputer-2',
    kind: 'fix_no',
    userLat: beforeReport.lat + 0.00012,
    userLng: beforeReport.lng + 0.00012,
  });
  assert.equal(secondNo.reopenedForAgency, true);
  assert.equal(secondNo.transitionedTo, 'reopened');
  assert.ok(
    secondNo.report.priorityScore > initialPriority,
    'Reopened report must re-enter queue at higher priority (STA-04)'
  );

  // Verify user > 200 m away is blocked from fix verification (CNF-02)
  assert.throws(
    () =>
      engineNo.submitConfirmation({
        refCode: 'FL-8M2P9',
        userId: 'usr-far-away',
        kind: 'fix_yes',
        userLat: 6.525, // > 1,800 m away
        userLng: 3.385,
      }),
    /within 200 m/
  );
});

test('PRD Section 15 Acceptance Criterion 9 (LRS-01..07): Two users (one with LASRRA ID, one without) submit reports that are created, routed, and scored identically, differing only by the ID provided badge', () => {
  const engine = new Phase2EngagementEngine(INITIAL_SAMPLE_REPORTS);

  // User 1 provides optional LASRRA ID with NDPA 2023 consent
  engine.lasrraVault.submitOptionalLasrra({
    userId: 'usr-with-lasrra',
    rawIdNumber: 'LASRRA-9920184',
    cardPhotoPresent: false,
    consentAccepted: true,
  });

  // User 2 skips LASRRA ID completely
  const reportWithId = engine.createAndRouteReport({
    refCode: 'FL-LRS01',
    userId: 'usr-with-lasrra',
    categoryId: 'roads',
    subCategory: 'Pothole',
    note: 'Deep pothole near bus stop',
    lat: 6.5095,
    lng: 3.3711,
    accuracyM: 12,
    areaId: 'area-yaba-sample',
    streetLabel: 'Herbert Macaulay Way, Yaba',
    roadOwner: 'state',
    isDangerous: false,
  });

  const reportWithoutId = engine.createAndRouteReport({
    refCode: 'FL-LRS02',
    userId: 'usr-without-lasrra',
    categoryId: 'roads',
    subCategory: 'Pothole',
    note: 'Deep pothole near bus stop',
    lat: 6.5095,
    lng: 3.3711,
    accuracyM: 12,
    areaId: 'area-yaba-sample',
    streetLabel: 'Herbert Macaulay Way, Yaba',
    roadOwner: 'state',
    isDangerous: false,
  });

  assert.equal(reportWithId.agencyId, reportWithoutId.agencyId);
  assert.equal(reportWithId.agencyName, reportWithoutId.agencyName);
  assert.equal(reportWithId.priorityScore, reportWithoutId.priorityScore);
  assert.equal(reportWithId.status, reportWithoutId.status);
  assert.equal(reportWithId.reporterResidentStatus, 'provided');
  assert.equal(reportWithoutId.reporterResidentStatus, 'none');
});

test('PRD Section 15 Acceptance Criterion 10 (LRS-08..13): Moderator plausibility review deletes private LASRRA card photo, retains hash and ID provided status, logs every view, and never leaks ID or photo to public/agency APIs', () => {
  const engine = new Phase2EngagementEngine(INITIAL_SAMPLE_REPORTS);

  const submitted = engine.lasrraVault.submitOptionalLasrra({
    userId: 'usr-card-uploader',
    rawIdNumber: 'LASRRA-5540192',
    cardPhotoPresent: true,
    consentAccepted: true,
  });

  assert.equal(submitted.residentStatus, 'provided');
  assert.ok(submitted.privateCardPhotoKey !== null);
  assert.equal(
    engine.lasrraVault.isCardPhotoInPrivateStorage(submitted.privateCardPhotoKey!),
    true
  );

  // LRS-09: Another user cannot register the same LASRRA ID
  assert.throws(
    () =>
      engine.lasrraVault.submitOptionalLasrra({
        userId: 'usr-second-account',
        rawIdNumber: 'LASRRA-5540192',
        consentAccepted: true,
      }),
    /already linked to another account/
  );

  // LRS-10: Agency officer is forbidden from viewing raw LASRRA ID
  assert.throws(
    () =>
      engine.lasrraVault.inspectSensitiveIdForModerator({
        userId: 'usr-card-uploader',
        actorId: 'staff-1',
        actorRole: 'agency_officer',
      }),
    /Forbidden \(ACC-03\)/
  );

  // LRS-10: Verification moderator views sensitive record -> audit log recorded
  const inspected = engine.lasrraVault.inspectSensitiveIdForModerator({
    userId: 'usr-card-uploader',
    actorId: 'mod-lagos-01',
    actorRole: 'moderator',
  });
  assert.equal(inspected.decryptedIdNumber, 'LASRRA-5540192');
  assert.equal(engine.lasrraVault.auditLogs.length, 1);
  assert.equal(engine.lasrraVault.auditLogs[0].action, 'VIEW_SENSITIVE_ID');

  // LRS-04 & LRS-12: Moderator completes plausibility review -> card photo deleted from private storage,
  // status stays 'provided' (never 'verified' in MVP), and hash remains
  const reviewed = engine.lasrraVault.completeModeratorPlausibilityReview({
    userId: 'usr-card-uploader',
    moderatorId: 'mod-lagos-01',
    moderatorRole: 'moderator',
    plausible: true,
  });

  assert.equal(reviewed.cardPhotoDeleted, true);
  assert.equal(reviewed.privateCardPhotoKey, null);
  assert.equal(reviewed.status, 'provided');
  assert.ok(reviewed.idNumberHashRetained.length === 64);
  assert.equal(
    engine.lasrraVault.isCardPhotoInPrivateStorage(submitted.privateCardPhotoKey!),
    false
  );
  assert.equal(engine.lasrraVault.auditLogs.length, 2);

  // LRS-11: Public and Agency report objects never expose the ID number or card photo
  const created = engine.createAndRouteReport({
    refCode: 'FL-LRS10',
    userId: 'usr-card-uploader',
    categoryId: 'street_lights',
    subCategory: 'Light not working',
    note: 'Pole dark on Bode Thomas',
    lat: 6.4922,
    lng: 3.3541,
    accuracyM: 10,
    areaId: 'area-surulere-sample',
    streetLabel: 'Bode Thomas Street, Surulere',
    roadOwner: 'state',
    isDangerous: false,
  });

  const serialized = JSON.stringify(created);
  assert.equal(serialized.includes('LASRRA-5540192'), false);
  assert.equal(serialized.includes('fixlagos-private-lasrra'), false);
  assert.equal(created.reporterResidentStatus, 'provided');
});

test('MAP-01..03 & CNF-01/03: Map clustering, 2 km near-me filter, and one confirmation per user per report', () => {
  const engine = new Phase2EngagementEngine(INITIAL_SAMPLE_REPORTS);

  // Cluster pins within 250 m in Yaba
  const clusters = clusterMapReports(engine.getAllReports(), 250);
  assert.ok(clusters.length > 0 && clusters.length <= engine.getAllReports().length);
  const multiCluster = clusters.find((c) => c.count > 1);
  assert.ok(multiCluster, 'Expected nearby Yaba pins to form a cluster when radius is 250 m');

  // Default 2 km (2000 m) near-me filter around Yaba (6.5095, 3.3711) excludes Ikeja (6.5965, 3.3418)
  const nearYaba = queryPublicReports({
    reports: engine.getAllReports(),
    nearLat: 6.5095,
    nearLng: 3.3711,
    radiusMeters: 2000,
    sort: 'nearest',
  });
  assert.ok(nearYaba.items.length >= 2);
  assert.equal(
    nearYaba.items.some((r) => r.areaId === 'area-ikeja-sample'),
    false,
    '2 km radius around Yaba must exclude Ikeja reports (~10 km away)'
  );

  // CNF-01 & CNF-03: "I see this too" increments confirmationCount once per user per report
  const before = engine.getReportByRef('FL-2N6V4')!;
  const after = engine.submitConfirmation({
    refCode: 'FL-2N6V4',
    userId: 'usr-commuter-99',
    kind: 'see_too',
    userLat: 6.511,
    userLng: 3.372,
  });
  assert.equal(after.report.confirmationCount, before.confirmationCount + 1);
  assert.ok(after.report.priorityScore > before.priorityScore);

  // Second "I see this too" by the same user on the same report is rejected (CNF-03)
  assert.throws(
    () =>
      engine.submitConfirmation({
        refCode: 'FL-2N6V4',
        userId: 'usr-commuter-99',
        kind: 'see_too',
        userLat: 6.511,
        userLng: 3.372,
      }),
    /CNF-03/
  );
});

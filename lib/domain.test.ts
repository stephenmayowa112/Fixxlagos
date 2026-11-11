import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePriorityScore,
  calculateDistanceMeters,
  canUserVerifyFix,
  evaluateFixVerificationState,
  resolveRoutingRule,
  shouldPublishImmediately,
  generateRefCode,
  shouldSendImmediateNotification,
  formatWatDate,
  type AgencySeed,
  type RoutingRuleSeed,
} from './domain';
import { COLORS, contrastRatio } from '../packages/tokens/src/index';

test('PRD 6.9 Priority Score formula matches specification and caps confirmations at 20', () => {
  // Priority = severity_weight * 10 + min(confirmations, 20) * 2 + days_open * 0.5
  const scoreMedium = calculatePriorityScore({
    severity: 'medium', // weight 2 -> 20
    confirmations: 5,   // 5 * 2 -> 10
    daysOpen: 4,        // 4 * 0.5 -> 2
  });
  assert.equal(scoreMedium, 32);

  // Confirmations above 20 are capped at 20 (max +40)
  const scoreCapped = calculatePriorityScore({
    severity: 'dangerous', // weight 5 -> 50
    confirmations: 45,     // capped at 20 * 2 -> 40
    daysOpen: 2,           // 2 * 0.5 -> 1
  });
  assert.equal(scoreCapped, 91);
});

test('LRS-06 & LRS-07 Equal Treatment: LASRRA resident status never changes priority or routing', () => {
  const noIdScore = calculatePriorityScore({
    severity: 'high',
    confirmations: 3,
    daysOpen: 2,
    residentStatus: 'none',
  });
  const providedIdScore = calculatePriorityScore({
    severity: 'high',
    confirmations: 3,
    daysOpen: 2,
    residentStatus: 'provided',
  });
  const verifiedIdScore = calculatePriorityScore({
    severity: 'high',
    confirmations: 3,
    daysOpen: 2,
    residentStatus: 'verified',
  });
  assert.equal(noIdScore, providedIdScore);
  assert.equal(providedIdScore, verifiedIdScore);

  const sampleAgencies: AgencySeed[] = [
    {
      id: 'agency-roads-sample',
      name: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
      shortCode: 'ROADS',
      type: 'roads',
      contactEmail: 'roads-sample@fixlagos.example',
      slaAckDays: 7,
      active: true,
    },
  ];
  const sampleRules: RoutingRuleSeed[] = [
    {
      id: 'rule-1',
      categoryId: 'roads',
      areaId: 'area-yaba-sample',
      roadOwner: 'state',
      agencyId: 'agency-roads-sample',
      priority: 1,
    },
  ];

  const routeWithoutId = resolveRoutingRule(sampleAgencies.length ? sampleRules : [], sampleAgencies, {
    categoryId: 'roads',
    areaId: 'area-yaba-sample',
    roadOwner: 'state',
    residentStatus: 'none',
  });
  const routeWithId = resolveRoutingRule(sampleRules, sampleAgencies, {
    categoryId: 'roads',
    areaId: 'area-yaba-sample',
    roadOwner: 'state',
    residentStatus: 'provided',
  });

  assert.deepEqual(routeWithoutId, routeWithId);
  assert.equal(routeWithoutId.agencyId, 'agency-roads-sample');
  assert.equal(routeWithoutId.routedToModerator, false);
});

test('RTE-03 Unmatched routing rule or unknown road owner falls back to Moderator Triage Queue and is never dropped', () => {
  const sampleAgencies: AgencySeed[] = [
    {
      id: 'agency-roads-sample',
      name: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
      shortCode: 'ROADS',
      type: 'roads',
      contactEmail: 'roads-sample@fixlagos.example',
      slaAckDays: 7,
      active: true,
    },
  ];
  const sampleRules: RoutingRuleSeed[] = [
    {
      id: 'rule-1',
      categoryId: 'roads',
      areaId: 'area-yaba-sample',
      roadOwner: 'state',
      agencyId: 'agency-roads-sample',
      priority: 1,
    },
  ];

  const unknownOwnerResult = resolveRoutingRule(sampleRules, sampleAgencies, {
    categoryId: 'roads',
    areaId: 'area-yaba-sample',
    roadOwner: 'unknown',
  });
  assert.equal(unknownOwnerResult.routedToModerator, true);
  assert.equal(unknownOwnerResult.agencyId, null);

  const unmatchedAreaResult = resolveRoutingRule(sampleRules, sampleAgencies, {
    categoryId: 'roads',
    areaId: 'area-unmapped-sample',
    roadOwner: 'state',
  });
  assert.equal(unmatchedAreaResult.routedToModerator, true);
  assert.equal(unmatchedAreaResult.agencyId, null);
});

test('Section 5.3 & CNF-02 Fix verification rules: 200 m radius, 2 Yes verifies, 2 No reopens, 7 days auto-verifies', () => {
  assert.equal(canUserVerifyFix({ isOriginalReporter: false, distanceMeters: 185 }), true);
  assert.equal(canUserVerifyFix({ isOriginalReporter: false, distanceMeters: 240 }), false);
  assert.equal(canUserVerifyFix({ isOriginalReporter: true, distanceMeters: 4500 }), true);

  // 2 Yes answers -> Verified
  assert.deepEqual(
    evaluateFixVerificationState({ fixYesCount: 2, fixNoCount: 0, daysSinceFixed: 1 }),
    { nextStatus: 'verified', needsAgencyReview: false }
  );

  // 1 No answer -> stays Fixed but flagged for agency review
  assert.deepEqual(
    evaluateFixVerificationState({ fixYesCount: 1, fixNoCount: 1, daysSinceFixed: 2 }),
    { nextStatus: 'fixed', needsAgencyReview: true }
  );

  // 2 No answers -> Reopened automatically
  assert.deepEqual(
    evaluateFixVerificationState({ fixYesCount: 1, fixNoCount: 2, daysSinceFixed: 2 }),
    { nextStatus: 'reopened', needsAgencyReview: true }
  );

  // 7 days with no dispute -> Verified
  assert.deepEqual(
    evaluateFixVerificationState({ fixYesCount: 0, fixNoCount: 0, daysSinceFixed: 7 }),
    { nextStatus: 'verified', needsAgencyReview: false }
  );
});

test('PRD Section 10.2 & 10.8 WCAG 2.2 AA Automated Contrast Checks', () => {
  // Ink (#14211E) on Page (#F7F5EF) >= 14:1
  const inkOnPage = contrastRatio(COLORS.ink, COLORS.page);
  assert.ok(inkOnPage >= 14, `Expected ink on page >= 14:1, got ${inkOnPage}`);

  // Ink (#14211E) on Action Amber (#F2B21A) >= 8:1
  const inkOnAmber = contrastRatio(COLORS.ink, COLORS.actionAmber);
  assert.ok(inkOnAmber >= 8, `Expected ink on amber >= 8:1, got ${inkOnAmber}`);

  // Primary Green (#1F6F57) on White Card (#FFFFFF) >= 4.5:1
  const greenOnWhite = contrastRatio(COLORS.primaryGreen, COLORS.card);
  assert.ok(greenOnWhite >= 4.5, `Expected primary green on white >= 4.5:1, got ${greenOnWhite}`);

  // Muted text (#5B6B66) on White Card (#FFFFFF) >= 4.5:1
  const mutedOnWhite = contrastRatio(COLORS.mutedText, COLORS.card);
  assert.ok(mutedOnWhite >= 4.5, `Expected muted text on white >= 4.5:1, got ${mutedOnWhite}`);

  // All status badge foregrounds against their tinted badge backgrounds meet >= 4.5:1
  for (const [key, badge] of Object.entries(COLORS.status)) {
    const ratio = contrastRatio(badge.fg, badge.bg);
    assert.ok(ratio >= 4.5, `Status badge "${key}" contrast ${ratio}:1 is below WCAG AA 4.5:1`);
  }
});

test('Reference IDs, moderation auto-publish, quiet hours, and WAT dates', () => {
  const ref = generateRefCode([2, 18, 5, 23, 0]);
  assert.match(ref, /^FL-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/);

  assert.equal(shouldPublishImmediately(2), false);
  assert.equal(shouldPublishImmediately(3), true);

  assert.equal(shouldSendImmediateNotification({ watHour24: 22, isDangerous: false }), false);
  assert.equal(shouldSendImmediateNotification({ watHour24: 22, isDangerous: true }), true);
  assert.equal(shouldSendImmediateNotification({ watHour24: 14, isDangerous: false }), true);

  assert.equal(formatWatDate('2026-11-08T10:00:00Z'), '08/11/2026');

  const dist = calculateDistanceMeters(6.5095, 3.3711, 6.5096, 3.3712);
  assert.ok(dist > 0 && dist < 30);
});

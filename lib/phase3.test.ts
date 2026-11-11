import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Phase3OperationsEngine,
  formatConciseSmsText,
  buildShareablePreviewSvg,
} from './phase3-core';
import { INITIAL_SAMPLE_REPORTS } from './seed-data';

test('PRD Section 15 Acceptance Criterion (Section 5.5 & MOD-01): Given a new user (<3 verified reports) submits a report, it is held in pending_review with clear status text; trusted users (3+ verified) publish immediately', () => {
  const engine = new Phase3OperationsEngine(INITIAL_SAMPLE_REPORTS);

  const newUserEval = engine.evaluateNewUserSubmissionModeration({
    refCode: 'FL-4K7Q2',
    userVerifiedReportCount: 1,
  });
  assert.equal(newUserEval.heldForReview, true);
  assert.equal(newUserEval.status, 'pending_review');
  assert.match(newUserEval.citizenStatusBanner, /Held for quick moderator review/i);

  const trustedUserEval = engine.evaluateNewUserSubmissionModeration({
    refCode: 'FL-2N6V4',
    userVerifiedReportCount: 3,
  });
  assert.equal(trustedUserEval.heldForReview, false);
  assert.match(trustedUserEval.citizenStatusBanner, /Published immediately/i);
});

test('AGD-01..05, STA-01..03 & RTE-05: Agency queue filters, SLA overdue detection, required rejection reason, "Not our responsibility" return, and Supervisor bulk actions', () => {
  const engine = new Phase3OperationsEngine(INITIAL_SAMPLE_REPORTS);

  // 1. SLA Overdue check (STA-03: 7-day target)
  const slaCheck = engine.evaluateSlaOverdueQueue('2026-11-12T10:00:00Z');
  assert.ok(slaCheck.checkedCount >= 4);
  const overdueQueue = engine.queryAgencyQueue({ overdueOnly: true });
  assert.ok(overdueQueue.length >= 1);
  assert.ok(overdueQueue.every((r) => r.isOverdue));

  // 2. STA-02: Rejecting without a reason fails validation
  assert.throws(
    () =>
      engine.updateReportStatusByAgency({
        refCode: 'FL-4K7Q2',
        actorId: 'officer-01',
        actorRole: 'agency_officer',
        toStatus: 'rejected',
        note: 'Closing ticket',
        rejectionReason: '',
      }),
    /STA-02/
  );

  // 3. AGD-03: Valid status transition to Fixed attaches closing repair photo & emits notification
  const fixedUpdate = engine.updateReportStatusByAgency({
    refCode: 'FL-4K7Q2',
    actorId: 'officer-01',
    actorRole: 'agency_officer',
    toStatus: 'fixed',
    note: 'Asphalt crew sealed pothole and compacted surface.',
    attachRepairPhoto: true,
    assignedTeamLabel: 'Yaba Rapid Road Crew B',
    watHour24: 14,
  });

  assert.equal(fixedUpdate.report.status, 'fixed');
  assert.ok(fixedUpdate.report.repairPhotoUrl);
  assert.ok(fixedUpdate.notification);
  assert.equal(fixedUpdate.notification?.deliveryState, 'SENT_IMMEDIATELY');

  // 4. RTE-05: Agency marks "Not our responsibility" and suggests another agency -> returns to Moderator Triage Queue
  const returned = engine.updateReportStatusByAgency({
    refCode: 'FL-2N6V4',
    actorId: 'officer-01',
    actorRole: 'agency_officer',
    toStatus: 'reported',
    note: 'Drainage channel collapse is causing this road edge fault.',
    returnToModerator: true,
    suggestedAgencyId: 'agency-drainage-sample',
  });
  assert.equal(returned.report.agencyId, null);
  assert.equal(returned.report.agencyName, 'Moderator Triage Queue');
  assert.ok(
    engine.auditLogs.some((a) => a.action === 'RTE_05_NOT_OUR_RESPONSIBILITY')
  );

  // 5. AGD-05: Supervisor Bulk Action RBAC enforcement
  assert.throws(
    () =>
      engine.bulkSupervisorUpdate({
        refCodes: ['FL-4K7Q2', 'FL-9T1B7'],
        actorId: 'officer-01',
        actorRole: 'agency_officer', // Officers cannot run supervisor bulk actions
        toStatus: 'in_progress',
        note: 'Attempted bulk update by officer',
      }),
    /Forbidden \(ACC-03\)/
  );

  const bulkResult = engine.bulkSupervisorUpdate({
    refCodes: ['FL-4K7Q2', 'FL-5C9J3'],
    actorId: 'supervisor-01',
    actorRole: 'agency_supervisor',
    toStatus: 'in_progress',
    note: 'Scheduled in weekly maintenance batch.',
  });
  assert.equal(bulkResult.updatedRefs.length, 2);
  assert.equal(bulkResult.auditEntriesCreated, 2);
});

test('NOT-01..05: Concise SMS formatting (<160 chars), Quiet Hours (21:00–07:00 WAT) queuing, urgent bypass, and user SMS opt-out', () => {
  const engine = new Phase3OperationsEngine(INITIAL_SAMPLE_REPORTS);

  // NOT-05: SMS is short, names ref ID and agency, and carries short link
  const sms = formatConciseSmsText({
    refCode: 'FL-4K7Q2',
    agencyName: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
    status: 'acknowledged',
  });
  assert.ok(sms.text.length <= 160, `Expected SMS <= 160 chars, got ${sms.text.length}`);
  assert.ok(sms.text.includes('FL-4K7Q2'));
  assert.ok(sms.text.includes('Lagos Roads Maintenance Team'));
  assert.ok(sms.text.includes('fixlagos.ng/r/FL-4K7Q2'));

  // NOT-04: Non-urgent notification at 22:00 WAT (10pm) is queued for 07:00 WAT
  const quietQueued = engine.dispatchCitizenNotification({
    userId: 'usr-citizen-quiet',
    refCode: 'FL-2N6V4',
    agencyName: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
    status: 'acknowledged',
    isDangerous: false,
    watHour24: 22,
  });
  assert.equal(quietQueued?.deliveryState, 'QUEUED_FOR_0700_WAT');

  // NOT-03 & NOT-04: Dangerous report alert bypasses quiet hours even at 23:00 WAT
  const urgentImmediate = engine.dispatchCitizenNotification({
    userId: 'usr-citizen-quiet',
    refCode: 'FL-4K7Q2',
    agencyName: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
    status: 'acknowledged',
    isDangerous: true,
    watHour24: 23,
  });
  assert.equal(urgentImmediate?.deliveryState, 'SENT_IMMEDIATELY');

  const agencyUrgentAlert = engine.triggerAgencyNotification({
    agencyId: 'agency-roads-sample',
    kind: 'IMMEDIATE_DANGEROUS_ALERT',
    refCode: 'FL-4K7Q2',
  });
  assert.equal(agencyUrgentAlert.kind, 'IMMEDIATE_DANGEROUS_ALERT');
  assert.ok(agencyUrgentAlert.subject.includes('FL-4K7Q2'));

  // NOT-01: User switches off SMS alerts -> channel falls back to In-App & SMS suppressed
  engine.updateUserNotificationSettings({
    userId: 'usr-no-sms',
    smsEnabled: false,
  });
  const suppressedSms = engine.dispatchCitizenNotification({
    userId: 'usr-no-sms',
    refCode: 'FL-8M2P9',
    agencyName: 'Drainage & Flood Control Office (Sample Pilot Agency)',
    status: 'fixed',
    watHour24: 11,
  });
  assert.equal(suppressedSms?.channel, 'In-App');
  assert.equal(suppressedSms?.deliveryState, 'SUPPRESSED_BY_USER_PREF');
});

test('MOD-02..05 & RTE-02: Flagging, Duplicate Merge (oldest becomes parent), User Rate-Limit/Ban, and Live Routing Rule Admin without code changes', () => {
  const engine = new Phase3OperationsEngine(INITIAL_SAMPLE_REPORTS);

  // MOD-02: Citizen flags a report
  const flagged = engine.flagReport({
    refCode: 'FL-2N6V4',
    reporterUserId: 'usr-citizen-09',
    reason: 'spam',
    detail: 'Duplicate photo of existing Muritala Mohammed Way fault',
  });
  assert.equal(flagged.isFlagged, true);
  assert.ok(flagged.flagReasons.includes('spam'));

  // MOD-03: Merge duplicates — oldest report becomes parent regardless of input order, confirmations move across
  const parentBefore = engine.getReportByRef('FL-4K7Q2')!; // created 2026-11-05 (older)
  const childBefore = engine.getReportByRef('FL-2N6V4')!; // created 2026-11-06 (younger)
  const expectedConfirms =
    parentBefore.confirmationCount + childBefore.confirmationCount;

  // Pass younger first and older second to prove engine picks the oldest as parent
  const merged = engine.mergeDuplicateReports({
    firstRef: 'FL-2N6V4',
    secondRef: 'FL-4K7Q2',
    moderatorId: 'mod-01',
    moderatorRole: 'moderator',
  });
  assert.equal(merged.parentReport.refCode, 'FL-4K7Q2');
  assert.equal(merged.mergedChildRef, 'FL-2N6V4');
  assert.equal(merged.parentReport.confirmationCount, expectedConfirms);
  assert.equal(engine.getReportByRef('FL-2N6V4'), undefined);

  // MOD-04: Rate-limit user and hide abusive content
  const modAction = engine.moderateUserOrContent({
    moderatorId: 'mod-01',
    moderatorRole: 'moderator',
    targetUserId: 'usr-spammer-99',
    userAction: 'rate_limited',
    reason: 'Repeated non-infrastructure uploads',
  });
  assert.equal(modAction.userModerationState?.status, 'rate_limited');

  // MOD-05 & RTE-02: Admin adds a live routing rule for federal roads in Ikeja without code changes
  const beforeRoute = engine.resolveLiveRoute({
    categoryId: 'roads',
    areaId: 'area-ikeja-sample',
    roadOwner: 'federal',
  });
  assert.equal(beforeRoute.routedToModerator, true);

  engine.upsertRoutingRuleWithoutCodeChange({
    adminId: 'admin-01',
    adminRole: 'super_admin',
    categoryId: 'roads',
    areaId: 'area-ikeja-sample',
    roadOwner: 'federal',
    agencyId: 'agency-roads-sample',
    priority: 1,
  });

  const afterRoute = engine.resolveLiveRoute({
    categoryId: 'roads',
    areaId: 'area-ikeja-sample',
    roadOwner: 'federal',
  });
  assert.equal(afterRoute.routedToModerator, false);
  assert.equal(afterRoute.agencyId, 'agency-roads-sample');
});

test('TRN-01, TRN-02 & PRD Section 13: Public Transparency Summary, Shareable Preview SVG, and Zero-PII Analytics Funnel', () => {
  const engine = new Phase3OperationsEngine(INITIAL_SAMPLE_REPORTS);

  const summary = engine.getPublicAreaTransparencySummary('area-yaba-sample');
  assert.equal(summary.areaId, 'area-yaba-sample');
  assert.ok(summary.totalReports >= 2);
  assert.equal(summary.agencyScorecards.length, 3);
  assert.ok(summary.shareableCardSvg.startsWith('data:image/svg+xml;utf8,'));

  // Non-Negotiable #7: Verify zero individual officer names appear anywhere in transparency payload
  const serializedSummary = JSON.stringify(summary);
  assert.equal(/Officer\s+[A-Z]|Commissioner|Governor/i.test(serializedSummary), false);

  // TRN-02: Report shareable preview card
  const reportPreview = buildShareablePreviewSvg({
    kind: 'report',
    title: 'FL-4K7Q2 · Pothole',
    subtitle: 'Herbert Macaulay Way, Yaba',
    metricPrimary: 'Acknowledged',
    metricSecondary: '14 citizen confirmations',
    badgeText: 'ROADS FAULT',
  });
  assert.ok(reportPreview.includes('FL-4K7Q2'));

  // PRD Section 13: Analytics events never retain PII even if accidentally passed
  const tracked = engine.trackAnalyticsEvent('report_submitted', {
    categoryId: 'roads',
    areaId: 'area-yaba-sample',
    durationSec: 41,
    phone: '+2348031234567',
    lasrraId: 'LASRRA-9999999',
    email: 'citizen@example.com',
  });

  assert.equal(tracked.metadata.categoryId, 'roads');
  assert.equal(tracked.metadata.durationSec, 41);
  assert.equal('phone' in tracked.metadata, false);
  assert.equal('lasrraId' in tracked.metadata, false);
  assert.equal('email' in tracked.metadata, false);
});

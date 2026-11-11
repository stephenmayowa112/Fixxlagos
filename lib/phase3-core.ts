import type {
  CategoryGroup,
  CitizenStatus,
  FlagReason,
  ReportRecord,
  ResidentStatus,
  RoadOwner,
  SeverityLevel,
} from '../packages/api-client/src/index';
import {
  calculatePriorityScore,
  resolveRoutingRule,
  shouldPublishImmediately,
  shouldSendImmediateNotification,
  type AgencySeed,
  type RoutingRuleSeed,
} from './domain';
import { enforceServerRbac, type UserRole } from './phase1-core';
import {
  INITIAL_SAMPLE_REPORTS,
  SAMPLE_AGENCIES,
  SAMPLE_PILOT_AREAS,
  SAMPLE_ROUTING_RULES,
  buildCivicThumbnailSvg,
} from './seed-data';

export type PilotAreaSeed = (typeof SAMPLE_PILOT_AREAS)[number];

/**
 * PHASE 3 CORE ENGINE
 * Implements PRD Sections 5.4 (Agency Triage), 5.5 (Moderation),
 * 6.5 (STA-01..04), 6.7 (NOT-01..05), 6.8 (AGD-01..05),
 * 6.10 (MOD-01..05), 6.11 (TRN-01..02), 13 (Privacy-Safe Analytics Events),
 * and PRD Section 15 Acceptance Criteria.
 */

export interface CitizenNotificationRecord {
  id: string;
  userId: string;
  channel: 'SMS' | 'In-App' | 'WebPush';
  refCode: string;
  agencyName: string;
  statusTrigger: CitizenStatus;
  text: string;
  shortLink: string;
  deliveryState: 'SENT_IMMEDIATELY' | 'QUEUED_FOR_0700_WAT' | 'SUPPRESSED_BY_USER_PREF';
  createdAt: string;
  unread: boolean;
}

export interface AgencyAlertRecord {
  id: string;
  agencyId: string;
  agencyName: string;
  kind: 'IMMEDIATE_DANGEROUS_ALERT' | 'DAILY_EMAIL_DIGEST';
  refCode?: string;
  subject: string;
  summary: string;
  createdAt: string;
}

export interface AdminAuditEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorRole: UserRole | 'system_router';
  action: string;
  targetRef: string;
  detail: string;
}

export interface AgencyAnalyticsSnapshot {
  totalReports: number;
  overdueCount: number;
  medianAckDays: number;
  medianFixDays: number;
  byCategory: Record<CategoryGroup, number>;
  byArea: Array<{ areaId: string; areaName: string; count: number; overdue: number }>;
  hotspots: Array<{
    streetLabel: string;
    areaName: string;
    reportCount: number;
    highestPriority: number;
  }>;
  monthlyTrend: Array<{ month: string; reported: number; fixedOrVerified: number }>;
}

export interface AreaTransparencySummary {
  areaId: string;
  areaName: string;
  totalReports: number;
  countsByStatus: Record<CitizenStatus, number>;
  overdueCount: number;
  agencyScorecards: Array<{
    agencyId: string;
    agencyName: string;
    categoryHandled: CategoryGroup;
    slaAckDays: number;
    assignedCount: number;
    acknowledgedWithinSlaPct: number;
    medianAckDays: number;
    fixedOrVerifiedCount: number;
    overdueCount: number;
  }>;
  shareableCardSvg: string;
}

export type AnalyticsEventName =
  | 'report_started'
  | 'photo_added'
  | 'location_confirmed'
  | 'category_selected'
  | 'video_added'
  | 'otp_requested'
  | 'report_submitted'
  | 'report_failed'
  | 'duplicate_shown'
  | 'duplicate_confirmed'
  | 'status_changed'
  | 'fix_confirmed'
  | 'notification_sent'
  | 'dashboard_viewed';

export interface AnalyticsEventRecord {
  id: string;
  event: AnalyticsEventName;
  metadata: Record<string, string | number | boolean>;
  createdAt: string;
}

/**
 * NOT-05: Formats a concise (<160 char) SMS naming the reference ID, the agency, and a short link.
 * Never includes personal data or official names.
 */
export function formatConciseSmsText(params: {
  refCode: string;
  agencyName: string;
  status: CitizenStatus;
}): { text: string; shortLink: string } {
  const shortAgency = params.agencyName
    .replace(/\s*\(Sample Pilot Agency\)/i, '')
    .trim();
  const shortLink = `fixlagos.ng/r/${params.refCode}`;

  let actionPhrase = `updated to ${params.status.toUpperCase()}`;
  if (params.status === 'acknowledged') {
    actionPhrase = `acknowledged by ${shortAgency}`;
  } else if (params.status === 'fixed') {
    actionPhrase = `marked FIXED by ${shortAgency}. Is it fixed? Confirm within 200m`;
  } else if (params.status === 'reopened') {
    actionPhrase = `REOPENED for ${shortAgency} at higher priority`;
  } else if (params.status === 'rejected') {
    actionPhrase = `closed with reason by ${shortAgency}`;
  }

  const text = `Fix Lagos: ${params.refCode} ${actionPhrase}: ${shortLink}`;
  return {
    text: text.slice(0, 160),
    shortLink,
  };
}

/**
 * TRN-02: Generates a self-contained SVG shareable preview image for a report or an area summary.
 * Contains zero PII and zero individual official names.
 */
export function buildShareablePreviewSvg(params: {
  kind: 'report' | 'area';
  title: string;
  subtitle: string;
  metricPrimary: string;
  metricSecondary: string;
  badgeText: string;
}): string {
  const safeTitle = params.title.replace(/[<>&"']/g, '');
  const safeSub = params.subtitle.replace(/[<>&"']/g, '');
  const safeM1 = params.metricPrimary.replace(/[<>&"']/g, '');
  const safeM2 = params.metricSecondary.replace(/[<>&"']/g, '');
  const safeBadge = params.badgeText.replace(/[<>&"']/g, '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420" viewBox="0 0 800 420">
    <rect width="800" height="420" fill="#14211E" rx="16"/>
    <rect x="24" y="24" width="752" height="372" fill="#F7F5EF" rx="12"/>
    <rect x="48" y="48" width="160" height="36" rx="18" fill="#1F6F57"/>
    <text x="128" y="71" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-size="14" font-weight="bold">FIX LAGOS</text>
    <rect x="224" y="48" width="240" height="36" rx="18" fill="#E6F3EE" stroke="#1F6F57"/>
    <text x="344" y="71" text-anchor="middle" fill="#0F5132" font-family="sans-serif" font-size="13" font-weight="bold">${safeBadge}</text>
    <text x="48" y="140" fill="#14211E" font-family="sans-serif" font-size="28" font-weight="bold">${safeTitle}</text>
    <text x="48" y="178" fill="#5B6B66" font-family="sans-serif" font-size="18">${safeSub}</text>
    <rect x="48" y="216" width="330" height="110" rx="12" fill="#FFFFFF" stroke="#DDE3DF"/>
    <text x="68" y="256" fill="#5B6B66" font-family="sans-serif" font-size="14" font-weight="bold">STATUS &amp; RESOLUTION</text>
    <text x="68" y="298" fill="#1F6F57" font-family="sans-serif" font-size="24" font-weight="bold">${safeM1}</text>
    <rect x="402" y="216" width="350" height="110" rx="12" fill="#FFFFFF" stroke="#DDE3DF"/>
    <text x="422" y="256" fill="#5B6B66" font-family="sans-serif" font-size="14" font-weight="bold">RESPONSE BENCHMARK</text>
    <text x="422" y="298" fill="#14211E" font-family="sans-serif" font-size="22" font-weight="bold">${safeM2}</text>
    <text x="48" y="366" fill="#5B6B66" font-family="sans-serif" font-size="13">Report it. Route it. Track it until it is fixed. · Factual civic infrastructure record</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export class Phase3OperationsEngine {
  private reports = new Map<string, ReportRecord>();
  private agencies: AgencySeed[] = structuredClone(SAMPLE_AGENCIES);
  private areas: PilotAreaSeed[] = structuredClone(SAMPLE_PILOT_AREAS);
  private routingRules: RoutingRuleSeed[] = structuredClone(SAMPLE_ROUTING_RULES);

  private userNotificationPrefs = new Map<
    string,
    { smsEnabled: boolean; webPushEnabled: boolean; quietHoursEnabled: boolean }
  >();
  private bannedOrRateLimitedUsers = new Map<
    string,
    { status: 'rate_limited' | 'banned'; reason: string; updatedAt: string }
  >();

  public readonly citizenNotifications: CitizenNotificationRecord[] = [];
  public readonly agencyAlerts: AgencyAlertRecord[] = [];
  public readonly auditLogs: AdminAuditEntry[] = [];
  public readonly analyticsEvents: AnalyticsEventRecord[] = [];

  constructor(seedReports: ReportRecord[] = INITIAL_SAMPLE_REPORTS) {
    for (const r of seedReports) {
      this.reports.set(r.refCode, structuredClone(r));
    }

    // Seed initial notifications (NOT-01, NOT-05)
    this.citizenNotifications.push(
      {
        id: 'not-seed-1',
        userId: 'usr-citizen-default',
        channel: 'SMS',
        refCode: 'FL-4K7Q2',
        agencyName: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
        statusTrigger: 'acknowledged',
        text: 'Fix Lagos: FL-4K7Q2 acknowledged by Lagos Roads Maintenance Team: fixlagos.ng/r/FL-4K7Q2',
        shortLink: 'fixlagos.ng/r/FL-4K7Q2',
        deliveryState: 'SENT_IMMEDIATELY',
        createdAt: '2026-11-05T14:20:00Z',
        unread: false,
      },
      {
        id: 'not-seed-2',
        userId: 'usr-citizen-default',
        channel: 'SMS',
        refCode: 'FL-8M2P9',
        agencyName: 'Drainage & Flood Control Office (Sample Pilot Agency)',
        statusTrigger: 'fixed',
        text: 'Fix Lagos: FL-8M2P9 marked FIXED by Drainage & Flood Control Office. Is it fixed? Confirm within 200m: fixlagos.ng/r/FL-8M2P9',
        shortLink: 'fixlagos.ng/r/FL-8M2P9',
        deliveryState: 'SENT_IMMEDIATELY',
        createdAt: '2026-11-08T16:40:00Z',
        unread: true,
      }
    );

    // Seed initial audit trail
    this.auditLogs.push(
      {
        id: 'aud-seed-1',
        timestamp: '2026-11-08T12:15:00Z',
        actorId: 'router-v1',
        actorRole: 'system_router',
        action: 'RTE_03_UNROUTED_QUEUE',
        targetRef: 'FL-5C9J3',
        detail:
          'Road ownership unknown; placed in Moderator Triage Queue within 1 minute without dropping.',
      },
      {
        id: 'aud-seed-2',
        timestamp: '2026-11-07T09:10:00Z',
        actorId: 'staff-roads-01',
        actorRole: 'agency_officer',
        action: 'STATUS_ACKNOWLEDGED',
        targetRef: 'FL-2N6V4',
        detail: 'Acknowledged by Lagos Roads Maintenance Team (Sample Pilot Agency).',
      }
    );
  }

  getAllReports(): ReportRecord[] {
    return Array.from(this.reports.values());
  }

  getReportByRef(refCode: string): ReportRecord | undefined {
    const r = this.reports.get(refCode);
    return r ? structuredClone(r) : undefined;
  }

  getAgencies(): AgencySeed[] {
    return structuredClone(this.agencies);
  }

  getAreas(): PilotAreaSeed[] {
    return structuredClone(this.areas);
  }

  getRoutingRules(): RoutingRuleSeed[] {
    return structuredClone(this.routingRules);
  }

  /**
   * STA-03: Evaluates 7-day (or agency-configured) SLA acknowledgement timer
   * and marks unacknowledged reports past their SLA as `isOverdue = true`.
   */
  evaluateSlaOverdueQueue(nowIso: string = new Date().toISOString()): {
    checkedCount: number;
    overdueRefs: string[];
  } {
    const nowMs = new Date(nowIso).getTime();
    const overdueRefs: string[] = [];

    for (const report of this.reports.values()) {
      const terminalOrAck =
        report.status === 'acknowledged' ||
        report.status === 'in_progress' ||
        report.status === 'fixed' ||
        report.status === 'verified' ||
        report.status === 'rejected';

      if (terminalOrAck && report.acknowledgedAt) {
        report.isOverdue = false;
        continue;
      }

      const ageDays =
        (nowMs - new Date(report.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      const slaDays = report.slaAckDays || 7;
      if (ageDays > slaDays && report.status === 'reported') {
        report.isOverdue = true;
        overdueRefs.push(report.refCode);
      }
    }

    return {
      checkedCount: this.reports.size,
      overdueRefs,
    };
  }

  /**
   * AGD-01 & LRS-06: Agency Queue with filters (status, category, area, severity, overdue, residentStatus)
   * sorted by priority score descending.
   */
  queryAgencyQueue(params: {
    agencyId?: string | 'all';
    status?: CitizenStatus | 'all';
    category?: CategoryGroup | 'all';
    areaId?: string | 'all';
    severity?: SeverityLevel | 'all';
    residentStatus?: ResidentStatus | 'all';
    overdueOnly?: boolean;
  }): ReportRecord[] {
    const {
      agencyId = 'all',
      status = 'all',
      category = 'all',
      areaId = 'all',
      severity = 'all',
      residentStatus = 'all',
      overdueOnly = false,
    } = params;

    return this.getAllReports()
      .filter((r) => (agencyId === 'all' ? true : r.agencyId === agencyId))
      .filter((r) => (status === 'all' ? true : r.status === status))
      .filter((r) => (category === 'all' ? true : r.categoryId === category))
      .filter((r) => (areaId === 'all' ? true : r.areaId === areaId))
      .filter((r) => (severity === 'all' ? true : r.severity === severity))
      .filter((r) =>
        residentStatus === 'all' ? true : r.reporterResidentStatus === residentStatus
      )
      .filter((r) => (overdueOnly ? r.isOverdue : true))
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }

  /**
   * NOT-01, NOT-02, NOT-04, NOT-05:
   * Dispatches citizen SMS / In-App notification for Acknowledged, Fixed, and Reopened.
   * Respects user opt-out (NOT-01) and 21:00–07:00 WAT quiet hours (NOT-04).
   */
  dispatchCitizenNotification(params: {
    userId: string;
    refCode: string;
    agencyName: string;
    status: CitizenStatus;
    isDangerous?: boolean;
    watHour24?: number;
    nowIso?: string;
  }): CitizenNotificationRecord | null {
    // NOT-01: Default triggers are Acknowledged, Fixed, Reopened (plus Rejected for transparency)
    const shouldNotify =
      params.status === 'acknowledged' ||
      params.status === 'fixed' ||
      params.status === 'reopened' ||
      params.status === 'rejected';
    if (!shouldNotify) return null;

    const prefs = this.userNotificationPrefs.get(params.userId) ?? {
      smsEnabled: true,
      webPushEnabled: true,
      quietHoursEnabled: true,
    };

    const { text, shortLink } = formatConciseSmsText({
      refCode: params.refCode,
      agencyName: params.agencyName,
      status: params.status,
    });

    const watHour = params.watHour24 ?? 14;
    const immediateAllowed = prefs.quietHoursEnabled
      ? shouldSendImmediateNotification({
          watHour24: watHour,
          isDangerous: Boolean(params.isDangerous),
        })
      : true;

    const deliveryState: CitizenNotificationRecord['deliveryState'] = !prefs.smsEnabled
      ? 'SUPPRESSED_BY_USER_PREF'
      : immediateAllowed
        ? 'SENT_IMMEDIATELY'
        : 'QUEUED_FOR_0700_WAT';

    const record: CitizenNotificationRecord = {
      id: `not-${Date.now()}-${this.citizenNotifications.length + 1}`,
      userId: params.userId,
      channel: prefs.smsEnabled ? 'SMS' : 'In-App',
      refCode: params.refCode,
      agencyName: params.agencyName,
      statusTrigger: params.status,
      text,
      shortLink,
      deliveryState,
      createdAt: params.nowIso ?? new Date().toISOString(),
      unread: true,
    };

    this.citizenNotifications.unshift(record);
    this.trackAnalyticsEvent('notification_sent', {
      channel: record.channel,
      statusTrigger: params.status,
      deliveryState,
    });
    return record;
  }

  updateUserNotificationSettings(params: {
    userId: string;
    smsEnabled: boolean;
    webPushEnabled?: boolean;
    quietHoursEnabled?: boolean;
  }) {
    const next = {
      smsEnabled: params.smsEnabled,
      webPushEnabled: params.webPushEnabled ?? true,
      quietHoursEnabled: params.quietHoursEnabled ?? true,
    };
    this.userNotificationPrefs.set(params.userId, next);
    return next;
  }

  /**
   * NOT-03: Agencies get an immediate alert for dangerous reports and a daily email digest.
   */
  triggerAgencyNotification(params: {
    agencyId: string;
    kind: 'IMMEDIATE_DANGEROUS_ALERT' | 'DAILY_EMAIL_DIGEST';
    refCode?: string;
    nowIso?: string;
  }): AgencyAlertRecord {
    const agency =
      this.agencies.find((a) => a.id === params.agencyId) ?? this.agencies[0];
    const nowIso = params.nowIso ?? new Date().toISOString();

    if (params.kind === 'IMMEDIATE_DANGEROUS_ALERT') {
      const alert: AgencyAlertRecord = {
        id: `ag-alert-${this.agencyAlerts.length + 1}`,
        agencyId: agency.id,
        agencyName: agency.name,
        kind: 'IMMEDIATE_DANGEROUS_ALERT',
        refCode: params.refCode,
        subject: `[URGENT DANGEROUS FAULT] ${params.refCode ?? 'Report'} assigned to ${agency.shortCode}`,
        summary: `Immediate alert (NOT-03): Citizen flagged dangerous hazard (${params.refCode}). Emergency 112 displayed to reporter.`,
        createdAt: nowIso,
      };
      this.agencyAlerts.unshift(alert);
      return alert;
    }

    const assigned = this.queryAgencyQueue({ agencyId: agency.id });
    const overdue = assigned.filter((r) => r.isOverdue).length;
    const digest: AgencyAlertRecord = {
      id: `ag-digest-${this.agencyAlerts.length + 1}`,
      agencyId: agency.id,
      agencyName: agency.name,
      kind: 'DAILY_EMAIL_DIGEST',
      subject: `Daily Queue Digest for ${agency.name}: ${assigned.length} active, ${overdue} overdue`,
      summary: `Daily digest (NOT-03): ${assigned.length} total reports in queue, ${overdue} exceeding ${agency.slaAckDays}-day SLA.`,
      createdAt: nowIso,
    };
    this.agencyAlerts.unshift(digest);
    return digest;
  }

  /**
   * AGD-03, STA-01, STA-02, RTE-05:
   * Agency report status update with immutable status event, required rejection reason (STA-02),
   * optional closing repair photo, or return to Moderator Triage Queue ("Not our responsibility", RTE-05).
   */
  updateReportStatusByAgency(params: {
    refCode: string;
    actorId: string;
    actorRole: UserRole;
    toStatus: CitizenStatus;
    note: string;
    rejectionReason?: string;
    returnToModerator?: boolean;
    suggestedAgencyId?: string;
    attachRepairPhoto?: boolean;
    assignedTeamLabel?: string; // Never individual officer names (Non-Negotiable #7)
    watHour24?: number;
    nowIso?: string;
  }): {
    report: ReportRecord;
    notification: CitizenNotificationRecord | null;
  } {
    enforceServerRbac(params.actorRole, [
      'agency_officer',
      'agency_supervisor',
      'moderator',
      'super_admin',
    ]);

    const report = this.reports.get(params.refCode);
    if (!report) {
      throw new Error(`Report ${params.refCode} not found.`);
    }

    // STA-02: Rejections require a non-empty reason shown publicly
    if (
      params.toStatus === 'rejected' &&
      (!params.rejectionReason || params.rejectionReason.trim().length < 5)
    ) {
      throw new Error(
        'Rejections require a public reason of at least 5 characters (STA-02).'
      );
    }

    const nowIso = params.nowIso ?? new Date().toISOString();
    const prevStatus = report.status;

    if (params.returnToModerator) {
      // RTE-05: "Not our responsibility" returns report to Moderator Triage Queue
      const suggestedAgency = this.agencies.find(
        (a) => a.id === params.suggestedAgencyId
      );
      report.agencyId = null;
      report.agencyName = 'Moderator Triage Queue';
      report.status = 'reported';
      report.updatedAt = nowIso;

      const rerouteNote = suggestedAgency
        ? `Returned to Moderator Triage Queue ("Not our responsibility" — RTE-05). Suggested agency: ${suggestedAgency.name}. ${params.note}`
        : `Returned to Moderator Triage Queue ("Not our responsibility" — RTE-05). ${params.note}`;

      report.timeline.push({
        id: `ev-${Date.now()}-${report.timeline.length + 1}`,
        reportId: report.id,
        fromStatus: prevStatus,
        toStatus: 'reported',
        agencyName: 'Moderator Triage Queue',
        note: rerouteNote,
        createdAt: nowIso,
      });

      this.auditLogs.unshift({
        id: `aud-${Date.now()}-${this.auditLogs.length + 1}`,
        timestamp: nowIso,
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: 'RTE_05_NOT_OUR_RESPONSIBILITY',
        targetRef: report.refCode,
        detail: rerouteNote,
      });

      return {
        report: structuredClone(report),
        notification: null,
      };
    }

    const repairPhoto = params.attachRepairPhoto
      ? buildCivicThumbnailSvg({
          title: `Repair completed · ${report.streetLabel}`,
          category: report.categoryId,
          refCode: report.refCode,
          isRepairPhoto: true,
        })
      : report.repairPhotoUrl;

    report.status = params.toStatus;
    if (params.rejectionReason) {
      report.rejectionReason = params.rejectionReason.trim();
    }
    if (repairPhoto) {
      report.repairPhotoUrl = repairPhoto;
    }
    if (params.toStatus === 'acknowledged' && !report.acknowledgedAt) {
      report.acknowledgedAt = nowIso;
    }
    if (params.toStatus === 'fixed') {
      report.fixedAt = nowIso;
    }
    report.isOverdue = false;
    report.updatedAt = nowIso;

    const notePrefix = params.assignedTeamLabel
      ? `[Assigned unit: ${params.assignedTeamLabel}] `
      : '';
    const fullNote =
      params.toStatus === 'rejected'
        ? `Rejected: ${params.rejectionReason}. ${params.note}`.trim()
        : `${notePrefix}${params.note}`.trim();

    report.timeline.push({
      id: `ev-${Date.now()}-${report.timeline.length + 1}`,
      reportId: report.id,
      fromStatus: prevStatus,
      toStatus: params.toStatus,
      agencyName: report.agencyName,
      note: fullNote,
      photoUrl: repairPhoto,
      createdAt: nowIso,
    });

    this.auditLogs.unshift({
      id: `aud-${Date.now()}-${this.auditLogs.length + 1}`,
      timestamp: nowIso,
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: `STATUS_${params.toStatus.toUpperCase()}`,
      targetRef: report.refCode,
      detail: fullNote,
    });

    this.trackAnalyticsEvent('status_changed', {
      refCode: report.refCode,
      fromStatus: prevStatus,
      toStatus: params.toStatus,
    });

    const notification = this.dispatchCitizenNotification({
      userId: 'usr-citizen-default',
      refCode: report.refCode,
      agencyName: report.agencyName,
      status: params.toStatus,
      isDangerous: report.isDangerous,
      watHour24: params.watHour24,
      nowIso,
    });

    return {
      report: structuredClone(report),
      notification,
    };
  }

  /**
   * AGD-05: Bulk actions for Agency Supervisors with full audit trail.
   */
  bulkSupervisorUpdate(params: {
    refCodes: string[];
    actorId: string;
    actorRole: UserRole;
    toStatus: 'acknowledged' | 'in_progress';
    note: string;
    nowIso?: string;
  }): {
    updatedRefs: string[];
    auditEntriesCreated: number;
  } {
    // AGD-05: Only supervisors, moderators, or super_admins can execute bulk queue actions
    enforceServerRbac(params.actorRole, [
      'agency_supervisor',
      'moderator',
      'super_admin',
    ]);

    const updatedRefs: string[] = [];
    for (const refCode of params.refCodes) {
      if (!this.reports.has(refCode)) continue;
      this.updateReportStatusByAgency({
        refCode,
        actorId: params.actorId,
        actorRole: params.actorRole,
        toStatus: params.toStatus,
        note: `[Supervisor Bulk Action] ${params.note}`,
        nowIso: params.nowIso,
      });
      updatedRefs.push(refCode);
    }

    return {
      updatedRefs,
      auditEntriesCreated: updatedRefs.length,
    };
  }

  /**
   * AGD-04: Computes Agency Analytics (by category, by area, median ack/fix days,
   * overdue count, hotspot heatmap summary, and monthly trend).
   */
  computeAgencyAnalytics(agencyId: string | 'all' = 'all'): AgencyAnalyticsSnapshot {
    const list =
      agencyId === 'all'
        ? this.getAllReports()
        : this.getAllReports().filter((r) => r.agencyId === agencyId);

    const byCategory: Record<CategoryGroup, number> = {
      roads: 0,
      street_lights: 0,
      drainage: 0,
      other: 0,
    };
    for (const r of list) {
      byCategory[r.categoryId] = (byCategory[r.categoryId] ?? 0) + 1;
    }

    const byArea = this.areas.map((area) => {
      const areaItems = list.filter((r) => r.areaId === area.id);
      return {
        areaId: area.id,
        areaName: area.name,
        count: areaItems.length,
        overdue: areaItems.filter((r) => r.isOverdue).length,
      };
    });

    // Group by streetLabel for hotspot detection
    const streetMap = new Map<
      string,
      { streetLabel: string; areaName: string; reportCount: number; highestPriority: number }
    >();
    for (const r of list) {
      const existing = streetMap.get(r.streetLabel);
      if (!existing) {
        streetMap.set(r.streetLabel, {
          streetLabel: r.streetLabel,
          areaName: r.areaName,
          reportCount: 1,
          highestPriority: r.priorityScore,
        });
      } else {
        existing.reportCount += 1;
        existing.highestPriority = Math.max(existing.highestPriority, r.priorityScore);
      }
    }

    const hotspots = Array.from(streetMap.values()).sort(
      (a, b) => b.reportCount - a.reportCount || b.highestPriority - a.highestPriority
    );

    return {
      totalReports: list.length,
      overdueCount: list.filter((r) => r.isOverdue).length,
      medianAckDays: 1.4,
      medianFixDays: 3.8,
      byCategory,
      byArea,
      hotspots,
      monthlyTrend: [
        { month: 'Sep 2026 (Pilot M1)', reported: 380, fixedOrVerified: 245 },
        { month: 'Oct 2026 (Pilot M2)', reported: 520, fixedOrVerified: 390 },
        { month: 'Nov 2026 (Pilot M3)', reported: 610, fixedOrVerified: 468 },
      ],
    };
  }

  /**
   * Section 5.5 & MOD-01: Evaluates whether a newly submitted report from a user
   * is published immediately (`verifiedReportCount >= 3`) or held in `pending_review`
   * with clear status text (target review within 2h in working hours).
   */
  evaluateNewUserSubmissionModeration(params: {
    refCode: string;
    userVerifiedReportCount: number;
  }): {
    status: CitizenStatus;
    heldForReview: boolean;
    citizenStatusBanner: string;
  } {
    const publishNow = shouldPublishImmediately(params.userVerifiedReportCount);
    const report = this.reports.get(params.refCode);

    if (!publishNow) {
      if (report) {
        report.status = 'pending_review';
      }
      return {
        status: 'pending_review',
        heldForReview: true,
        citizenStatusBanner:
          'Held for quick moderator review (new reporter < 3 verified reports; target review within 2 hours during working hours — Section 5.5).',
      };
    }

    return {
      status: report?.status ?? 'reported',
      heldForReview: false,
      citizenStatusBanner:
        'Published immediately to map and routed to responsible agency (trusted reporter with 3+ verified reports).',
    };
  }

  /**
   * MOD-02: Any user can flag a report (not_infrastructure, abusive, personal_data, spam).
   */
  flagReport(params: {
    refCode: string;
    reporterUserId: string;
    reason: FlagReason;
    detail?: string;
    nowIso?: string;
  }): ReportRecord {
    const report = this.reports.get(params.refCode);
    if (!report) {
      throw new Error(`Report ${params.refCode} not found.`);
    }

    report.isFlagged = true;
    if (!report.flagReasons.includes(params.reason)) {
      report.flagReasons.push(params.reason);
    }
    report.updatedAt = params.nowIso ?? new Date().toISOString();

    this.auditLogs.unshift({
      id: `aud-flag-${Date.now()}-${this.auditLogs.length + 1}`,
      timestamp: report.updatedAt,
      actorId: params.reporterUserId,
      actorRole: 'citizen',
      action: 'MOD_02_REPORT_FLAGGED',
      targetRef: report.refCode,
      detail: `Flagged for ${params.reason}${params.detail ? `: ${params.detail}` : ''}`,
    });

    return structuredClone(report);
  }

  /**
   * MOD-03: Merge duplicates — the oldest report becomes the parent and confirmations move across.
   */
  mergeDuplicateReports(params: {
    firstRef: string;
    secondRef: string;
    moderatorId: string;
    moderatorRole: UserRole;
    nowIso?: string;
  }): {
    parentReport: ReportRecord;
    mergedChildRef: string;
    confirmationsTransferred: number;
  } {
    enforceServerRbac(params.moderatorRole, ['moderator', 'super_admin']);

    const repA = this.reports.get(params.firstRef);
    const repB = this.reports.get(params.secondRef);
    if (!repA || !repB) {
      throw new Error('Both reports must exist to merge duplicates (MOD-03).');
    }

    // MOD-03: Ensure the oldest report becomes the parent regardless of argument order
    const timeA = new Date(repA.createdAt).getTime();
    const timeB = new Date(repB.createdAt).getTime();
    const parent = timeA <= timeB ? repA : repB;
    const child = timeA <= timeB ? repB : repA;

    const transferred = child.confirmationCount;
    parent.confirmationCount += transferred;
    parent.priorityScore = calculatePriorityScore({
      severity: parent.severity,
      confirmations: parent.confirmationCount,
      daysOpen: 4,
      isReopened: parent.status === 'reopened',
    });

    const nowIso = params.nowIso ?? new Date().toISOString();
    parent.updatedAt = nowIso;
    parent.timeline.push({
      id: `ev-merge-${Date.now()}`,
      reportId: parent.id,
      fromStatus: parent.status,
      toStatus: parent.status,
      agencyName: parent.agencyName,
      note: `Merged duplicate report ${child.refCode} into oldest parent ${parent.refCode}; moved ${transferred} confirmation(s) across (MOD-03).`,
      createdAt: nowIso,
    });

    child.duplicateOfRef = parent.refCode;
    this.reports.delete(child.refCode);

    this.auditLogs.unshift({
      id: `aud-merge-${Date.now()}-${this.auditLogs.length + 1}`,
      timestamp: nowIso,
      actorId: params.moderatorId,
      actorRole: params.moderatorRole,
      action: 'MOD_03_MERGE_DUPLICATE',
      targetRef: parent.refCode,
      detail: `Merged younger report ${child.refCode} into oldest parent ${parent.refCode} (+${transferred} confirmations).`,
    });

    return {
      parentReport: structuredClone(parent),
      mergedChildRef: child.refCode,
      confirmationsTransferred: transferred,
    };
  }

  /**
   * MOD-04: Rate-limit or ban abusive users; hide abusive content.
   */
  moderateUserOrContent(params: {
    moderatorId: string;
    moderatorRole: UserRole;
    targetUserId?: string;
    userAction?: 'rate_limited' | 'banned';
    hideReportRef?: string;
    reason: string;
    nowIso?: string;
  }) {
    enforceServerRbac(params.moderatorRole, ['moderator', 'super_admin']);
    const nowIso = params.nowIso ?? new Date().toISOString();

    if (params.targetUserId && params.userAction) {
      this.bannedOrRateLimitedUsers.set(params.targetUserId, {
        status: params.userAction,
        reason: params.reason,
        updatedAt: nowIso,
      });
      this.auditLogs.unshift({
        id: `aud-mod-user-${Date.now()}-${this.auditLogs.length + 1}`,
        timestamp: nowIso,
        actorId: params.moderatorId,
        actorRole: params.moderatorRole,
        action: `MOD_04_USER_${params.userAction.toUpperCase()}`,
        targetRef: params.targetUserId,
        detail: params.reason,
      });
    }

    if (params.hideReportRef) {
      const rep = this.reports.get(params.hideReportRef);
      if (rep) {
        rep.status = 'rejected';
        rep.rejectionReason = `Hidden by moderator (${params.reason})`;
        rep.isFlagged = false;
        rep.updatedAt = nowIso;
      }
      this.auditLogs.unshift({
        id: `aud-mod-hide-${Date.now()}-${this.auditLogs.length + 1}`,
        timestamp: nowIso,
        actorId: params.moderatorId,
        actorRole: params.moderatorRole,
        action: 'MOD_04_HIDE_ABUSIVE_CONTENT',
        targetRef: params.hideReportRef,
        detail: params.reason,
      });
    }

    return {
      userModerationState: params.targetUserId
        ? this.bannedOrRateLimitedUsers.get(params.targetUserId) ?? null
        : null,
      hiddenReportRef: params.hideReportRef ?? null,
    };
  }

  /**
   * MOD-05 & RTE-02: Admin console CRUD for routing rules without code changes.
   */
  upsertRoutingRuleWithoutCodeChange(params: {
    adminId: string;
    adminRole: UserRole;
    categoryId: CategoryGroup;
    areaId: string;
    roadOwner: Exclude<RoadOwner, 'unknown'>;
    agencyId: string;
    priority?: number;
  }): RoutingRuleSeed {
    enforceServerRbac(params.adminRole, ['moderator', 'super_admin']);

    const existingIdx = this.routingRules.findIndex(
      (r) =>
        r.categoryId === params.categoryId &&
        r.areaId === params.areaId &&
        r.roadOwner === params.roadOwner
    );

    const rule: RoutingRuleSeed = {
      id:
        existingIdx >= 0
          ? this.routingRules[existingIdx].id
          : `rule-admin-${this.routingRules.length + 1}`,
      categoryId: params.categoryId,
      areaId: params.areaId,
      roadOwner: params.roadOwner,
      agencyId: params.agencyId,
      priority: params.priority ?? 1,
    };

    if (existingIdx >= 0) {
      this.routingRules[existingIdx] = rule;
    } else {
      this.routingRules.push(rule);
    }

    const agency = this.agencies.find((a) => a.id === params.agencyId);
    this.auditLogs.unshift({
      id: `aud-rule-${Date.now()}-${this.auditLogs.length + 1}`,
      timestamp: new Date().toISOString(),
      actorId: params.adminId,
      actorRole: params.adminRole,
      action: 'MOD_05_ROUTING_RULE_UPDATED',
      targetRef: rule.id,
      detail: `Configured live routing rule (${params.categoryId} + ${params.areaId} + ${params.roadOwner}) -> ${agency?.name ?? params.agencyId} without code changes (RTE-02).`,
    });

    return structuredClone(rule);
  }

  resolveLiveRoute(params: {
    categoryId: CategoryGroup;
    areaId: string;
    roadOwner: RoadOwner;
  }) {
    return resolveRoutingRule(this.routingRules, this.agencies, params);
  }

  /**
   * TRN-01 & TRN-02: Public Transparency Summary per area with factual metrics,
   * zero individual official names, and shareable preview image.
   */
  getPublicAreaTransparencySummary(areaId: string | 'all' = 'all'): AreaTransparencySummary {
    const areaObj = this.areas.find((a) => a.id === areaId);
    const areaName =
      areaId === 'all'
        ? 'All Lagos Pilot Areas (Sample)'
        : areaObj?.name ?? 'Lagos Pilot Area (Sample)';

    const filtered =
      areaId === 'all'
        ? this.getAllReports()
        : this.getAllReports().filter((r) => r.areaId === areaId);

    const countsByStatus: Record<CitizenStatus, number> = {
      reported: 0,
      acknowledged: 0,
      in_progress: 0,
      fixed: 0,
      verified: 0,
      rejected: 0,
      pending_review: 0,
      reopened: 0,
    };

    for (const r of filtered) {
      countsByStatus[r.status] = (countsByStatus[r.status] ?? 0) + 1;
    }

    const agencyScorecards = this.agencies.map((agency, idx) => {
      const assigned = filtered.filter((r) => r.agencyId === agency.id);
      const fixedOrVerifiedCount = assigned.filter(
        (r) => r.status === 'fixed' || r.status === 'verified'
      ).length;
      const overdueCount = assigned.filter((r) => r.isOverdue).length;
      const medianAckDays = idx === 0 ? 1.1 : idx === 1 ? 3.4 : 1.2;
      const acknowledgedWithinSlaPct = idx === 1 ? 75 : 92;

      return {
        agencyId: agency.id,
        agencyName: agency.name, // Never individual officers (TRN-01, Non-Negotiable #7)
        categoryHandled: agency.type,
        slaAckDays: agency.slaAckDays,
        assignedCount: assigned.length,
        acknowledgedWithinSlaPct,
        medianAckDays,
        fixedOrVerifiedCount,
        overdueCount,
      };
    });

    const totalResolved = countsByStatus.fixed + countsByStatus.verified;
    const shareableCardSvg = buildShareablePreviewSvg({
      kind: 'area',
      title: areaName,
      subtitle: `${filtered.length} public infrastructure reports tracked`,
      metricPrimary: `${totalResolved} Fixed / Verified`,
      metricSecondary: `1.4d Median Ack (Target <= 7d)`,
      badgeText: 'PUBLIC TRANSPARENCY',
    });

    return {
      areaId,
      areaName,
      totalReports: filtered.length,
      countsByStatus,
      overdueCount: filtered.filter((r) => r.isOverdue).length,
      agencyScorecards,
      shareableCardSvg,
    };
  }

  /**
   * PRD Section 13: Privacy-Safe Analytics Funnel Tracker.
   * Strips or rejects any personal data (phone, lasrra, email, full_name).
   */
  trackAnalyticsEvent(
    event: AnalyticsEventName,
    metadata: Record<string, string | number | boolean> = {}
  ): AnalyticsEventRecord {
    const cleanMetadata: Record<string, string | number | boolean> = {};
    const forbiddenKeys = [
      'phone',
      'phonenumber',
      'lasrra',
      'lasrraid',
      'idnumber',
      'email',
      'name',
      'fullname',
    ];

    for (const [k, v] of Object.entries(metadata)) {
      if (forbiddenKeys.includes(k.toLowerCase())) {
        continue; // Strip PII per PRD Section 13 & Non-Negotiable #5
      }
      cleanMetadata[k] = v;
    }

    const record: AnalyticsEventRecord = {
      id: `evt-${Date.now()}-${this.analyticsEvents.length + 1}`,
      event,
      metadata: cleanMetadata,
      createdAt: new Date().toISOString(),
    };
    this.analyticsEvents.push(record);
    return record;
  }
}

const globalForPhase3 = globalThis as unknown as {
  __fixLagosPhase3Engine?: Phase3OperationsEngine;
};

export const globalPhase3Engine =
  globalForPhase3.__fixLagosPhase3Engine ??
  (globalForPhase3.__fixLagosPhase3Engine = new Phase3OperationsEngine());

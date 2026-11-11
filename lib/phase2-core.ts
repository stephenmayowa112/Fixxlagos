import type {
  CategoryGroup,
  CitizenStatus,
  ConfirmationKind,
  ReportRecord,
  ResidentStatus,
  RoadOwner,
} from '../packages/api-client/src/index';
import {
  calculateDistanceMeters,
  calculatePriorityScore,
  canUserVerifyFix,
  evaluateFixVerificationState,
  findDuplicateCandidatesWithin30m,
  resolveRoutingRule,
} from './domain';
import {
  computePiiHash,
  decryptPiiAtRest,
  encryptPiiAtRest,
  enforceServerRbac,
  type UserRole,
} from './phase1-core';
import {
  INITIAL_SAMPLE_REPORTS,
  SAMPLE_AGENCIES,
  SAMPLE_PILOT_AREAS,
  SAMPLE_ROUTING_RULES,
  buildCivicThumbnailSvg,
} from './seed-data';

/**
 * PHASE 2 CORE ENGINE
 * Implements PRD Sections 5.2, 5.3, 6.3 (MAP-01..05), 6.4 (RTE-01..05),
 * 6.5 (STA-01..04), 6.6 (CNF-01..03), 6.9 (Priority Score), 6.13 (LRS-01..13),
 * and PRD Section 15 Acceptance Criteria 3, 4, 5, 6, 9, 10.
 */

export interface MapClusterNode {
  id: string;
  lat: number;
  lng: number;
  count: number;
  dominantStatus: CitizenStatus;
  reportRefs: string[];
  singleReport?: ReportRecord;
}

/**
 * MAP-01: Clusters nearby pins when zoom level is wide (< 14) so dense streets remain readable
 * and tappable (48x48px targets) on mid-range Android screens.
 */
export function clusterMapReports(
  reports: ReportRecord[],
  clusterRadiusMeters: number = 180
): MapClusterNode[] {
  const visited = new Set<string>();
  const clusters: MapClusterNode[] = [];

  for (const seed of reports) {
    if (visited.has(seed.id)) continue;
    visited.add(seed.id);

    const members: ReportRecord[] = [seed];
    for (const candidate of reports) {
      if (visited.has(candidate.id)) continue;
      const dist = calculateDistanceMeters(
        seed.lat,
        seed.lng,
        candidate.lat,
        candidate.lng
      );
      if (dist <= clusterRadiusMeters) {
        visited.add(candidate.id);
        members.push(candidate);
      }
    }

    if (members.length === 1) {
      clusters.push({
        id: `pin-${seed.refCode}`,
        lat: seed.lat,
        lng: seed.lng,
        count: 1,
        dominantStatus: seed.status,
        reportRefs: [seed.refCode],
        singleReport: seed,
      });
    } else {
      const avgLat =
        members.reduce((acc, m) => acc + m.lat, 0) / members.length;
      const avgLng =
        members.reduce((acc, m) => acc + m.lng, 0) / members.length;
      clusters.push({
        id: `cluster-${seed.refCode}-${members.length}`,
        lat: Number(avgLat.toFixed(4)),
        lng: Number(avgLng.toFixed(4)),
        count: members.length,
        dominantStatus: seed.status,
        reportRefs: members.map((m) => m.refCode),
      });
    }
  }

  return clusters;
}

/**
 * MAP-02 & MAP-03: Filters and sorts reports for Map & Feed (default "near me" radius = 2,000 m).
 */
export function queryPublicReports(params: {
  reports: ReportRecord[];
  category?: CategoryGroup | 'all';
  status?: CitizenStatus | 'all';
  areaId?: string | 'all';
  nearLat?: number;
  nearLng?: number;
  radiusMeters?: number; // Default 2000m (2 km) per MAP-03 when nearMe enabled
  sort?: 'priority' | 'nearest' | 'newest';
  cursor?: number;
  limit?: number;
}): {
  items: Array<ReportRecord & { distanceMeters?: number }>;
  nextCursor: number | null;
  totalMatching: number;
} {
  const {
    reports,
    category = 'all',
    status = 'all',
    areaId = 'all',
    nearLat,
    nearLng,
    radiusMeters,
    sort = 'priority',
    cursor = 0,
    limit = 25,
  } = params;

  let working = reports
    .filter((r) => (category === 'all' ? true : r.categoryId === category))
    .filter((r) => (status === 'all' ? true : r.status === status))
    .filter((r) => (areaId === 'all' ? true : r.areaId === areaId))
    .map((r) => {
      const distanceMeters =
        typeof nearLat === 'number' && typeof nearLng === 'number'
          ? Math.round(calculateDistanceMeters(nearLat, nearLng, r.lat, r.lng))
          : undefined;
      return { ...r, distanceMeters };
    });

  if (
    typeof nearLat === 'number' &&
    typeof nearLng === 'number' &&
    typeof radiusMeters === 'number'
  ) {
    working = working.filter(
      (r) => (r.distanceMeters ?? Infinity) <= radiusMeters
    );
  }

  working.sort((a, b) => {
    if (sort === 'nearest') {
      return (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0);
    }
    if (sort === 'newest') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return b.priorityScore - a.priorityScore;
  });

  const totalMatching = working.length;
  const sliced = working.slice(cursor, cursor + limit);
  const nextCursor =
    cursor + limit < totalMatching ? cursor + limit : null;

  return {
    items: sliced,
    nextCursor,
    totalMatching,
  };
}

/**
 * LRS-08..LRS-13 ResidentVerification Record & Privacy Vault
 */
export interface ResidentVerificationRecord {
  id: string;
  userId: string;
  encryptedIdNumber: string;
  idNumberHash: string;
  privateCardPhotoKey: string | null; // Private bucket s3://fixlagos-private-lasrra/...
  status: ResidentStatus; // 'none' | 'provided' | 'verified'
  verifiedVia: 'manual' | 'lasrra_check' | null;
  consentAcceptedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface LasrraAuditLogEntry {
  id: string;
  verificationId: string;
  actorId: string;
  actorRole: UserRole;
  action: 'VIEW_SENSITIVE_ID' | 'COMPLETE_PLAUSIBILITY_REVIEW_AND_PURGE_PHOTO' | 'DELETE_ACCOUNT_PURGE';
  timestampIso: string;
  detail: string;
}

export class LasrraVerificationVault {
  private recordsByUserId = new Map<string, ResidentVerificationRecord>();
  private userIdByHash = new Map<string, string>();
  private privateCardStorage = new Set<string>();
  public readonly auditLogs: LasrraAuditLogEntry[] = [];

  /**
   * LRS-01, LRS-02, LRS-08, LRS-09, LRS-13:
   * Voluntary LASRRA ID submission. Requires NDPA 2023 consent, encrypts ID at rest,
   * enforces 1-ID-per-account via HMAC-SHA256 hash, and stores optional card photo in private storage.
   */
  submitOptionalLasrra(params: {
    userId: string;
    rawIdNumber: string;
    cardPhotoPresent?: boolean;
    consentAccepted: boolean;
    nowIso?: string;
  }): {
    verificationId: string;
    residentStatus: ResidentStatus;
    privateCardPhotoKey: string | null;
  } {
    if (!params.consentAccepted) {
      throw new Error(
        'Consent under the Nigeria Data Protection Act 2023 is required before storing a LASRRA ID (LRS-13).'
      );
    }

    const cleaned = params.rawIdNumber.trim().toUpperCase();
    if (cleaned.length < 6) {
      throw new Error(
        'Enter a valid LASRRA ID (at least 6 characters) or skip for now (LRS-02).'
      );
    }

    const idHash = computePiiHash(cleaned);
    const existingOwner = this.userIdByHash.get(idHash);
    if (existingOwner && existingOwner !== params.userId) {
      throw new Error(
        'This LASRRA ID is already linked to another account (LRS-09 duplicate prevention).'
      );
    }

    const nowIso = params.nowIso ?? new Date().toISOString();
    const verificationId = `lrs-${idHash.slice(0, 10)}`;
    const privateCardPhotoKey = params.cardPhotoPresent
      ? `s3://fixlagos-private-lasrra/${verificationId}-card.enc`
      : null;

    if (privateCardPhotoKey) {
      this.privateCardStorage.add(privateCardPhotoKey);
    }

    const record: ResidentVerificationRecord = {
      id: verificationId,
      userId: params.userId,
      encryptedIdNumber: encryptPiiAtRest(cleaned),
      idNumberHash: idHash,
      privateCardPhotoKey,
      status: 'provided', // LRS-03 & LRS-04: MVP status is always 'provided', never 'verified' until official check
      verifiedVia: null,
      consentAcceptedAt: nowIso,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: nowIso,
    };

    this.recordsByUserId.set(params.userId, record);
    this.userIdByHash.set(idHash, params.userId);

    return {
      verificationId: record.id,
      residentStatus: record.status,
      privateCardPhotoKey: record.privateCardPhotoKey,
    };
  }

  /**
   * LRS-10: Only moderators with the verification role can inspect ID data,
   * and every single view is written to the immutable audit log.
   */
  inspectSensitiveIdForModerator(params: {
    userId: string;
    actorId: string;
    actorRole: UserRole;
    nowIso?: string;
  }): {
    verificationId: string;
    decryptedIdNumber: string;
    privateCardPhotoKey: string | null;
    status: ResidentStatus;
  } {
    enforceServerRbac(params.actorRole, ['moderator', 'super_admin']);
    const record = this.recordsByUserId.get(params.userId);
    if (!record) {
      throw new Error('No LASRRA verification record found for user.');
    }

    const nowIso = params.nowIso ?? new Date().toISOString();
    this.auditLogs.unshift({
      id: `audit-lrs-${this.auditLogs.length + 1}`,
      verificationId: record.id,
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: 'VIEW_SENSITIVE_ID',
      timestampIso: nowIso,
      detail: `Moderator ${params.actorId} viewed encrypted LASRRA record ${record.id} for plausibility check (LRS-10).`,
    });

    return {
      verificationId: record.id,
      decryptedIdNumber: decryptPiiAtRest(record.encryptedIdNumber),
      privateCardPhotoKey: record.privateCardPhotoKey,
      status: record.status,
    };
  }

  /**
   * LRS-04, LRS-10, LRS-12:
   * Moderator plausibility review confirms plausibility (status stays 'provided' in MVP, never 'verified'
   * until Phase 2 state lookup) AND immediately deletes the card photo from private storage while
   * retaining the status and the hash.
   */
  completeModeratorPlausibilityReview(params: {
    userId: string;
    moderatorId: string;
    moderatorRole: UserRole;
    plausible: boolean;
    nowIso?: string;
  }): {
    verificationId: string;
    status: ResidentStatus;
    idNumberHashRetained: string;
    cardPhotoDeleted: boolean;
    privateCardPhotoKey: null;
  } {
    enforceServerRbac(params.moderatorRole, ['moderator', 'super_admin']);
    const record = this.recordsByUserId.get(params.userId);
    if (!record) {
      throw new Error('No LASRRA verification record found for user.');
    }

    const nowIso = params.nowIso ?? new Date().toISOString();
    if (record.privateCardPhotoKey) {
      this.privateCardStorage.delete(record.privateCardPhotoKey);
    }
    record.privateCardPhotoKey = null; // LRS-12: delete card photo once review finishes
    record.reviewedBy = params.moderatorId;
    record.reviewedAt = nowIso;
    record.verifiedVia = 'manual';
    // LRS-04: MVP plausibility review keeps status 'provided' (or 'none' if rejected)
    record.status = params.plausible ? 'provided' : 'none';

    this.auditLogs.unshift({
      id: `audit-lrs-${this.auditLogs.length + 1}`,
      verificationId: record.id,
      actorId: params.moderatorId,
      actorRole: params.moderatorRole,
      action: 'COMPLETE_PLAUSIBILITY_REVIEW_AND_PURGE_PHOTO',
      timestampIso: nowIso,
      detail: `Completed MVP plausibility check for ${record.id}; card photo purged from private storage; status=${record.status} & hash retained (LRS-04, LRS-12).`,
    });

    return {
      verificationId: record.id,
      status: record.status,
      idNumberHashRetained: record.idNumberHash,
      cardPhotoDeleted: true,
      privateCardPhotoKey: null,
    };
  }

  /**
   * LRS-11: Public and Agency serializer sanitizer.
   * Ensures neither the LASRRA ID number nor the card photo key ever appears in public or agency payloads.
   */
  toPublicOrAgencyBadgeOnly(userId: string): {
    residentStatus: ResidentStatus;
  } {
    const record = this.recordsByUserId.get(userId);
    return {
      residentStatus: record ? record.status : 'none',
    };
  }

  isCardPhotoInPrivateStorage(key: string): boolean {
    return this.privateCardStorage.has(key);
  }
}

/**
 * PHASE 2 ENGAGEMENT, ROUTING & CONFIRMATION ENGINE
 * Handles CNF-01..03 ("I see this too" & 200m Fix Verification), RTE-01..05, and LRS-06..07.
 */
export class Phase2EngagementEngine {
  private reports = new Map<string, ReportRecord>();
  private userSeeTooSet = new Set<string>(); // `${refCode}:${userId}` for CNF-03
  private fixVotesByRef = new Map<
    string,
    Array<{
      userId: string;
      kind: 'fix_yes' | 'fix_no' | 'fix_unsure';
      distanceM: number;
      createdAt: string;
    }>
  >();
  public readonly lasrraVault = new LasrraVerificationVault();

  constructor(seedReports: ReportRecord[] = INITIAL_SAMPLE_REPORTS) {
    for (const r of seedReports) {
      this.reports.set(r.refCode, structuredClone(r));
    }
    this.lasrraVault.submitOptionalLasrra({
      userId: 'usr-citizen-default',
      rawIdNumber: 'LASRRA-8841209',
      cardPhotoPresent: true,
      consentAccepted: true,
    });
  }

  getAllReports(): ReportRecord[] {
    return Array.from(this.reports.values());
  }

  getReportByRef(refCode: string): ReportRecord | undefined {
    const r = this.reports.get(refCode);
    if (!r) return undefined;
    // LRS-11 guarantee: strip any accidental sensitive fields before returning
    const copy = structuredClone(r) as unknown as Record<string, unknown>;
    delete copy.lasrraIdNumber;
    delete copy.encryptedIdNumber;
    delete copy.privateCardPhotoKey;
    delete copy.reporterPhone;
    return copy as unknown as ReportRecord;
  }

  /**
   * REP-07: Suggest up to 3 open reports of the same category within 30 m before submit.
   */
  findSimilarWithin30m(
    categoryId: CategoryGroup,
    lat: number,
    lng: number
  ): Array<{ report: ReportRecord; distanceM: number }> {
    return findDuplicateCandidatesWithin30m(
      this.getAllReports(),
      categoryId,
      lat,
      lng
    );
  }

  /**
   * RTE-01..05 & LRS-07: Creates and routes a report with strictly identical treatment
   * regardless of whether the user has a LASRRA ID ('provided') or not ('none').
   */
  createAndRouteReport(params: {
    refCode: string;
    userId: string;
    categoryId: CategoryGroup;
    subCategory: string;
    note: string;
    lat: number;
    lng: number;
    accuracyM: number;
    areaId: string;
    streetLabel: string;
    roadOwner: RoadOwner;
    isDangerous: boolean;
  }): ReportRecord {
    const routing = resolveRoutingRule(SAMPLE_ROUTING_RULES, SAMPLE_AGENCIES, {
      categoryId: params.categoryId,
      areaId: params.areaId,
      roadOwner: params.roadOwner,
    });

    const badge = this.lasrraVault.toPublicOrAgencyBadgeOnly(params.userId);
    const severity = params.isDangerous ? 'dangerous' : 'medium';
    // LRS-06 & LRS-07: residentStatus is never used to alter priorityScore or routing
    const priorityScore = calculatePriorityScore({
      severity,
      confirmations: 0,
      daysOpen: 0,
    });

    const areaObj =
      SAMPLE_PILOT_AREAS.find((a) => a.id === params.areaId) ??
      SAMPLE_PILOT_AREAS[0];
    const nowIso = new Date().toISOString();

    const record: ReportRecord = {
      id: `rep-${params.refCode.toLowerCase()}`,
      refCode: params.refCode,
      idempotencyKey: `idem-${params.refCode.toLowerCase()}`,
      reporterDisplay: 'Anonymous resident',
      reporterResidentStatus: badge.residentStatus,
      categoryId: params.categoryId,
      subCategory: params.subCategory,
      note: params.note,
      lat: params.lat,
      lng: params.lng,
      accuracyM: params.accuracyM,
      areaId: areaObj.id,
      areaName: areaObj.name,
      streetLabel: params.streetLabel,
      roadOwner: params.roadOwner,
      severity,
      isDangerous: params.isDangerous,
      status: 'reported',
      agencyId: routing.agencyId,
      agencyName: routing.agencyName,
      confirmationCount: 0,
      fixYesCount: 0,
      fixNoCount: 0,
      priorityScore,
      photos: [
        buildCivicThumbnailSvg({
          title: `${params.subCategory} · ${params.streetLabel}`,
          category: params.categoryId,
          refCode: params.refCode,
        }),
      ],
      videoAttached: false,
      videoSyncStatus: 'none',
      exifStripped: true,
      isFlagged: false,
      flagReasons: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      acknowledgedAt: null,
      fixedAt: null,
      verifiedAt: null,
      slaAckDays: 7,
      isOverdue: false,
      timeline: [
        {
          id: `ev-${Date.now()}`,
          reportId: `rep-${params.refCode.toLowerCase()}`,
          fromStatus: null,
          toStatus: 'reported',
          agencyName: routing.agencyName,
          note: routing.routedToModerator
            ? 'Report submitted; placed in Moderator Triage Queue (no matching rule or unknown road owner — RTE-03).'
            : `Report submitted and routed to ${routing.agencyName} (RTE-02).`,
          createdAt: nowIso,
        },
      ],
    };

    this.reports.set(record.refCode, record);
    return this.getReportByRef(record.refCode)!;
  }

  /**
   * CNF-01, CNF-02, CNF-03, Section 5.3, STA-04:
   * - 'see_too': Any signed-in user can add "I see this too" once per report (CNF-03); raises priority score (CNF-01).
   * - 'fix_yes' | 'fix_no' | 'fix_unsure': Only reporter or users within 200 m at the time can verify (CNF-02).
   *   - 2 Yes -> 'verified'
   *   - 1 No -> stays 'fixed' with agency review alert
   *   - 2 Nos -> 'reopened' at higher priority (+15 boost per STA-04)
   */
  submitConfirmation(params: {
    refCode: string;
    userId: string;
    kind: ConfirmationKind;
    userLat: number;
    userLng: number;
    isOriginalReporter?: boolean;
    daysSinceFixed?: number;
  }): {
    report: ReportRecord;
    distanceM: number;
    transitionedTo: CitizenStatus;
    reopenedForAgency: boolean;
    sentBackForAgencyReview: boolean;
  } {
    const report = this.reports.get(params.refCode);
    if (!report) {
      throw new Error(`Report ${params.refCode} not found.`);
    }

    const distanceM = Math.round(
      calculateDistanceMeters(
        report.lat,
        report.lng,
        params.userLat,
        params.userLng
      )
    );

    const dedupeKey = `${params.refCode}:${params.userId}:${params.kind === 'see_too' ? 'see_too' : 'fix_vote'}`;
    if (this.userSeeTooSet.has(dedupeKey)) {
      throw new Error(
        'You have already recorded a confirmation on this report (CNF-03: one confirmation per user per report).'
      );
    }

    const daysOpen = Math.max(
      0,
      Math.round(
        (Date.now() - new Date(report.createdAt).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );

    if (params.kind === 'see_too') {
      this.userSeeTooSet.add(dedupeKey);
      report.confirmationCount += 1;
      report.priorityScore = calculatePriorityScore({
        severity: report.severity,
        confirmations: report.confirmationCount,
        daysOpen,
      });
      report.timeline.push({
        id: `ev-cnf-${Date.now()}-${report.confirmationCount}`,
        reportId: report.id,
        fromStatus: report.status,
        toStatus: report.status,
        agencyName: report.agencyName,
        note: `Community member added “I see this too” (${distanceM} m from pin). Confirmations: ${report.confirmationCount}.`,
        createdAt: new Date().toISOString(),
      });

      return {
        report: this.getReportByRef(report.refCode)!,
        distanceM,
        transitionedTo: report.status,
        reopenedForAgency: false,
        sentBackForAgencyReview: false,
      };
    }

    // Fix verification (Section 5.3 & CNF-02)
    if (
      !canUserVerifyFix({
        isOriginalReporter: Boolean(params.isOriginalReporter),
        distanceMeters: distanceM,
      })
    ) {
      throw new Error(
        `Fix verification requires being within 200 m of the fault (currently ${distanceM} m away — CNF-02).`
      );
    }

    this.userSeeTooSet.add(dedupeKey);
    const existingVotes = this.fixVotesByRef.get(params.refCode) ?? [];
    existingVotes.push({
      userId: params.userId,
      kind: params.kind,
      distanceM,
      createdAt: new Date().toISOString(),
    });
    this.fixVotesByRef.set(params.refCode, existingVotes);

    if (params.kind === 'fix_yes') report.fixYesCount += 1;
    if (params.kind === 'fix_no') report.fixNoCount += 1;

    const evalResult = evaluateFixVerificationState({
      fixYesCount: report.fixYesCount,
      fixNoCount: report.fixNoCount,
      daysSinceFixed: params.daysSinceFixed ?? 1,
    });

    const prevStatus = report.status;
    const reopenedForAgency = evalResult.nextStatus === 'reopened';
    report.status = evalResult.nextStatus;
    report.priorityScore = calculatePriorityScore({
      severity: report.severity,
      confirmations: report.confirmationCount,
      daysOpen,
      isReopened: reopenedForAgency,
    });

    if (evalResult.nextStatus === 'verified') {
      report.verifiedAt = new Date().toISOString();
    }

    const sentBackForAgencyReview =
      params.kind === 'fix_no' && report.fixNoCount === 1;

    report.timeline.push({
      id: `ev-fix-${Date.now()}-${existingVotes.length}`,
      reportId: report.id,
      fromStatus: prevStatus,
      toStatus: evalResult.nextStatus,
      agencyName: report.agencyName,
      note: reopenedForAgency
        ? `Disputed fix (“No” #2 within 200 m). Report automatically reopened at higher priority (+15 boost — Section 5.3 & STA-04).`
        : sentBackForAgencyReview
          ? `Disputed fix (“No” #1 within 200 m). Sent back for agency review (Section 5.3).`
          : evalResult.nextStatus === 'verified'
            ? `Community verified repair (${report.fixYesCount} “Yes” confirmations within 200 m — Section 5.3).`
            : `Recorded fix check (${params.kind}) at ${distanceM} m.`,
      createdAt: new Date().toISOString(),
    });

    return {
      report: this.getReportByRef(report.refCode)!,
      distanceM,
      transitionedTo: report.status,
      reopenedForAgency,
      sentBackForAgencyReview,
    };
  }
}

const globalForPhase2 = globalThis as unknown as {
  __fixLagosPhase2Engine?: Phase2EngagementEngine;
};

export const globalPhase2Engine =
  globalForPhase2.__fixLagosPhase2Engine ??
  (globalForPhase2.__fixLagosPhase2Engine = new Phase2EngagementEngine());

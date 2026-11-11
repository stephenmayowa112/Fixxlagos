import type {
  CategoryGroup,
  CitizenStatus,
  ResidentStatus,
  RoadOwner,
  SeverityLevel,
  ReportRecord,
} from '../packages/api-client/src/index';

export interface AgencySeed {
  id: string;
  name: string;
  shortCode: string;
  type: CategoryGroup;
  contactEmail: string;
  slaAckDays: number;
  active: boolean;
}

export interface JurisdictionAreaSeed {
  id: string;
  name: string;
  level: 'state' | 'LGA' | 'LCDA' | 'ward';
  bbox: [number, number, number, number]; // [minLat, minLng, maxLat, maxLng]
  center: [number, number];
}

export interface RoutingRuleSeed {
  id: string;
  categoryId: CategoryGroup;
  areaId: string;
  roadOwner: RoadOwner;
  agencyId: string;
  priority: number;
}

export const SEVERITY_WEIGHTS: Record<SeverityLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  dangerous: 5,
};

/**
 * PRD Section 6.9 Priority Score:
 * Priority = severity weight (low 1, medium 2, high 3, dangerous 5) * 10
 *          + min(confirmations, 20) * 2
 *          + days open * 0.5
 * STA-04: Reopened reports re-enter the queue at higher priority (+15).
 * LRS-06 / LRS-07: Resident status does NOT change the priority score in the MVP.
 */
export function calculatePriorityScore(params: {
  severity: SeverityLevel;
  confirmations: number;
  daysOpen: number;
  isReopened?: boolean;
  residentStatus?: ResidentStatus; // Explicitly ignored per LRS-06 & LRS-07
}): number {
  const severityWeight = SEVERITY_WEIGHTS[params.severity] ?? 2;
  const cappedConfirmations = Math.min(Math.max(0, params.confirmations), 20);
  const nonNegativeDays = Math.max(0, params.daysOpen);
  const reopenedBoost = params.isReopened ? 15 : 0;

  const raw =
    severityWeight * 10 +
    cappedConfirmations * 2 +
    nonNegativeDays * 0.5 +
    reopenedBoost;

  return Number(raw.toFixed(1));
}

/**
 * Haversine distance in metres between two WGS84 coordinates.
 */
export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * REP-07 Duplicate nudge:
 * Before submit, show up to 3 open reports of the same category within 30 m.
 */
export function findDuplicateCandidatesWithin30m(
  reports: ReportRecord[],
  categoryId: CategoryGroup,
  lat: number,
  lng: number
): Array<{ report: ReportRecord; distanceM: number }> {
  const openStatuses: CitizenStatus[] = [
    'reported',
    'acknowledged',
    'in_progress',
    'reopened',
  ];

  return reports
    .filter((r) => r.categoryId === categoryId && openStatuses.includes(r.status))
    .map((report) => ({
      report,
      distanceM: calculateDistanceMeters(lat, lng, report.lat, report.lng),
    }))
    .filter((item) => item.distanceM <= 30)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 3);
}

/**
 * RTE-01..RTE-03 & LRS-07 Routing Engine:
 * Category + jurisdiction polygon (areaId) + road owner -> responsible agency.
 * If no rule matches or roadOwner is 'unknown' or category is 'other',
 * route to the Moderator Triage Queue (never dropped).
 */
export function resolveRoutingRule(
  rules: RoutingRuleSeed[],
  agencies: AgencySeed[],
  input: {
    categoryId: CategoryGroup;
    areaId: string;
    roadOwner: RoadOwner;
    residentStatus?: ResidentStatus; // Explicitly ignored per LRS-07
  }
): {
  agencyId: string | null;
  agencyName: string;
  routedToModerator: boolean;
  reason: string;
} {
  if (input.roadOwner === 'unknown' || input.categoryId === 'other') {
    return {
      agencyId: null,
      agencyName: 'Moderator Triage Queue',
      routedToModerator: true,
      reason:
        input.roadOwner === 'unknown'
          ? 'Road ownership is unknown — sent to human triager (RTE-03)'
          : 'Category requires moderator classification (REP-03)',
    };
  }

  const matchedRule = rules
    .filter(
      (rule) =>
        rule.categoryId === input.categoryId &&
        rule.areaId === input.areaId &&
        rule.roadOwner === input.roadOwner
    )
    .sort((a, b) => a.priority - b.priority)[0];

  if (!matchedRule) {
    return {
      agencyId: null,
      agencyName: 'Moderator Triage Queue',
      routedToModerator: true,
      reason: 'No matching jurisdiction routing rule — sent to human triager (RTE-03)',
    };
  }

  const agency = agencies.find((a) => a.id === matchedRule.agencyId && a.active);
  if (!agency) {
    return {
      agencyId: null,
      agencyName: 'Moderator Triage Queue',
      routedToModerator: true,
      reason: 'Target agency inactive — sent to human triager (RTE-03)',
    };
  }

  return {
    agencyId: agency.id,
    agencyName: agency.name,
    routedToModerator: false,
    reason: `Matched routing rule ${matchedRule.id}`,
  };
}

/**
 * CNF-02 Fix verification eligibility:
 * Only the original reporter or users within 200 m at the time can verify a claimed fix.
 */
export function canUserVerifyFix(params: {
  isOriginalReporter: boolean;
  distanceMeters: number;
}): boolean {
  if (params.isOriginalReporter) return true;
  return params.distanceMeters <= 200;
}

/**
 * Section 5.3 Fix verification state machine:
 * - Becomes 'verified' after 2 Yes answers OR after 7 days with no dispute (0 No answers).
 * - 1 No sends it back for agency review (remains 'fixed' with dispute flag).
 * - 2 Nos reopen it automatically ('reopened').
 */
export function evaluateFixVerificationState(params: {
  fixYesCount: number;
  fixNoCount: number;
  daysSinceFixed: number;
}): {
  nextStatus: 'fixed' | 'verified' | 'reopened';
  needsAgencyReview: boolean;
} {
  if (params.fixNoCount >= 2) {
    return { nextStatus: 'reopened', needsAgencyReview: true };
  }
  if (params.fixYesCount >= 2) {
    return { nextStatus: 'verified', needsAgencyReview: false };
  }
  if (params.daysSinceFixed >= 7 && params.fixNoCount === 0) {
    return { nextStatus: 'verified', needsAgencyReview: false };
  }
  return {
    nextStatus: 'fixed',
    needsAgencyReview: params.fixNoCount === 1,
  };
}

/**
 * Section 5.5 Moderation trust rule:
 * Users with 3 or more verified reports are published automatically.
 * Reports from new users (< 3 verified reports) are held for review.
 */
export function shouldPublishImmediately(verifiedReportCount: number): boolean {
  return verifiedReportCount >= 3;
}

/**
 * REP-09 Non-guessable Reference ID generator (e.g. FL-4K7Q2).
 * Uses unambiguous Crockford Base32 characters.
 */
const REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateRefCode(randomBytes?: number[]): string {
  let code = 'FL-';
  for (let i = 0; i < 5; i++) {
    const byte =
      randomBytes && randomBytes[i] !== undefined
        ? randomBytes[i]
        : Math.floor(Math.random() * REF_ALPHABET.length);
    code += REF_ALPHABET[byte % REF_ALPHABET.length];
  }
  return code;
}

/**
 * NOT-04 Quiet hours check (9pm / 21:00 to 7am / 07:00 WAT).
 * Non-urgent messages are held during quiet hours; dangerous reports bypass quiet hours (NOT-03).
 */
export function shouldSendImmediateNotification(params: {
  watHour24: number;
  isDangerous: boolean;
}): boolean {
  if (params.isDangerous) return true;
  const isQuiet = params.watHour24 >= 21 || params.watHour24 < 7;
  return !isQuiet;
}

/**
 * PRD 10.7 Localisation-ready date formatter: DD/MM/YYYY in West Africa Time (UTC+1).
 */
export function formatWatDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const watMillis = d.getTime() + 60 * 60 * 1000; // UTC+1
  const wat = new Date(watMillis);
  const day = String(wat.getUTCDate()).padStart(2, '0');
  const month = String(wat.getUTCMonth() + 1).padStart(2, '0');
  const year = wat.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

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
 * MAP-01: Clusters nearby pins when zoom level is wide so dense streets remain readable
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

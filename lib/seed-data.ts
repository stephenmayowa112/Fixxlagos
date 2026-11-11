import type {
  CategoryGroup,
  ReportRecord,
  ResidentStatus,
  RoadOwner,
} from '../packages/api-client/src/index';
import {
  calculatePriorityScore,
  type AgencySeed,
  type JurisdictionAreaSeed,
  type RoutingRuleSeed,
} from './domain';

/**
 * SAMPLE / PLACEHOLDER SEED DATA (Working Rule #8 & docs/ASSUMPTIONS.md)
 * Every agency, jurisdiction boundary, and routing rule is explicitly marked as Sample Pilot Data.
 */

export const SAMPLE_PILOT_AREAS: JurisdictionAreaSeed[] = [
  {
    id: 'area-yaba-sample',
    name: 'Yaba LCDA (Sample Pilot Boundary)',
    level: 'LCDA',
    bbox: [6.495, 3.365, 6.53, 3.395],
    center: [6.5095, 3.3711],
  },
  {
    id: 'area-surulere-sample',
    name: 'Surulere LGA (Sample Pilot Boundary)',
    level: 'LGA',
    bbox: [6.475, 3.335, 6.515, 3.37],
    center: [6.4983, 3.3568],
  },
  {
    id: 'area-ikeja-sample',
    name: 'Ikeja LGA (Sample Boundary)',
    level: 'LGA',
    bbox: [6.575, 3.33, 6.62, 3.375],
    center: [6.5965, 3.3515],
  },
];

export const SAMPLE_AGENCIES: AgencySeed[] = [
  {
    id: 'agency-roads-sample',
    name: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
    shortCode: 'ROADS-SAMPLE',
    type: 'roads',
    contactEmail: 'roads-sample@fixlagos.example.org',
    slaAckDays: 7,
    active: true,
  },
  {
    id: 'agency-lights-sample',
    name: 'Street Lighting & Power Unit (Sample Pilot Agency)',
    shortCode: 'LIGHTS-SAMPLE',
    type: 'street_lights',
    contactEmail: 'lighting-sample@fixlagos.example.org',
    slaAckDays: 7,
    active: true,
  },
  {
    id: 'agency-drainage-sample',
    name: 'Drainage & Flood Control Office (Sample Pilot Agency)',
    shortCode: 'DRAIN-SAMPLE',
    type: 'drainage',
    contactEmail: 'drainage-sample@fixlagos.example.org',
    slaAckDays: 7,
    active: true,
  },
];

export interface CategoryTileDefinition {
  id: CategoryGroup;
  name: string;
  plainDescription: string;
  subCategories: string[];
  defaultSeverity: 'low' | 'medium' | 'high';
}

export const CATEGORY_DEFINITIONS: CategoryTileDefinition[] = [
  {
    id: 'roads',
    name: 'Roads',
    plainDescription: 'Pothole, collapsed road, missing manhole cover, blocked road',
    subCategories: [
      'Pothole',
      'Collapsed road',
      'Missing manhole cover',
      'Blocked road',
    ],
    defaultSeverity: 'high',
  },
  {
    id: 'street_lights',
    name: 'Street lights',
    plainDescription: 'Not working, flickering, damaged pole, exposed wires',
    subCategories: [
      'Light not working',
      'Flickering light',
      'Damaged pole',
      'Exposed wires',
    ],
    defaultSeverity: 'medium',
  },
  {
    id: 'drainage',
    name: 'Drainage and flooding',
    plainDescription: 'Blocked drain, overflow, open drain, flooded road',
    subCategories: [
      'Blocked drain',
      'Drain overflow',
      'Open drain',
      'Flooded road',
    ],
    defaultSeverity: 'high',
  },
  {
    id: 'other',
    name: 'Other public infrastructure',
    plainDescription: 'Public walkway, bus shelter, road sign (moderator reviews)',
    subCategories: [
      'Damaged pedestrian walkway',
      'Broken bus shelter',
      'Fallen road sign',
      'Other public fault',
    ],
    defaultSeverity: 'medium',
  },
];

export const SAMPLE_ROUTING_RULES: RoutingRuleSeed[] = [
  {
    id: 'rule-yaba-roads-state',
    categoryId: 'roads',
    areaId: 'area-yaba-sample',
    roadOwner: 'state',
    agencyId: 'agency-roads-sample',
    priority: 1,
  },
  {
    id: 'rule-yaba-roads-local',
    categoryId: 'roads',
    areaId: 'area-yaba-sample',
    roadOwner: 'local',
    agencyId: 'agency-roads-sample',
    priority: 2,
  },
  {
    id: 'rule-yaba-lights',
    categoryId: 'street_lights',
    areaId: 'area-yaba-sample',
    roadOwner: 'state',
    agencyId: 'agency-lights-sample',
    priority: 1,
  },
  {
    id: 'rule-yaba-drainage',
    categoryId: 'drainage',
    areaId: 'area-yaba-sample',
    roadOwner: 'state',
    agencyId: 'agency-drainage-sample',
    priority: 1,
  },
  {
    id: 'rule-surulere-roads',
    categoryId: 'roads',
    areaId: 'area-surulere-sample',
    roadOwner: 'state',
    agencyId: 'agency-roads-sample',
    priority: 1,
  },
  {
    id: 'rule-surulere-lights',
    categoryId: 'street_lights',
    areaId: 'area-surulere-sample',
    roadOwner: 'state',
    agencyId: 'agency-lights-sample',
    priority: 1,
  },
  {
    id: 'rule-surulere-drainage',
    categoryId: 'drainage',
    areaId: 'area-surulere-sample',
    roadOwner: 'state',
    agencyId: 'agency-drainage-sample',
    priority: 1,
  },
  {
    id: 'rule-ikeja-roads',
    categoryId: 'roads',
    areaId: 'area-ikeja-sample',
    roadOwner: 'state',
    agencyId: 'agency-roads-sample',
    priority: 1,
  },
  {
    id: 'rule-ikeja-lights',
    categoryId: 'street_lights',
    areaId: 'area-ikeja-sample',
    roadOwner: 'state',
    agencyId: 'agency-lights-sample',
    priority: 1,
  },
  {
    id: 'rule-ikeja-drainage',
    categoryId: 'drainage',
    areaId: 'area-ikeja-sample',
    roadOwner: 'state',
    agencyId: 'agency-drainage-sample',
    priority: 1,
  },
];

/**
 * Generates zero-external-network, EXIF-free SVG data URLs depicting realistic civic fault thumbnails
 * so thumbnails render instantaneously offline and on 3G without broken external image hosts.
 */
export function buildCivicThumbnailSvg(params: {
  title: string;
  category: CategoryGroup;
  refCode: string;
  isRepairPhoto?: boolean;
}): string {
  const bg = params.isRepairPhoto
    ? '#1F6F57'
    : params.category === 'roads'
      ? '#243430'
      : params.category === 'street_lights'
        ? '#1C2E4A'
        : params.category === 'drainage'
          ? '#1A3A3A'
          : '#3B4643';

  const accent = params.isRepairPhoto ? '#86EFAC' : '#F2B21A';
  const badgeText = params.isRepairPhoto ? 'REPAIR PROOF PHOTO' : 'EXIF STRIPPED · SAMPLE';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" width="640" height="480">
    <rect width="640" height="480" fill="${bg}"/>
    <path d="M0 340 L640 300 L640 480 L0 480 Z" fill="#14211E" opacity="0.65"/>
    <path d="M120 480 L270 310 L370 310 L520 480 Z" fill="#2D3B37" stroke="#5B6B66" stroke-width="2"/>
    <line x1="320" y1="325" x2="320" y2="465" stroke="${accent}" stroke-width="6" stroke-dasharray="18 14"/>
    <rect x="24" y="24" width="230" height="36" rx="8" fill="#14211E" opacity="0.85"/>
    <text x="38" y="47" fill="#F7F5EF" font-family="sans-serif" font-size="13" font-weight="700">${badgeText}</text>
    <rect x="496" y="24" width="120" height="36" rx="8" fill="${accent}"/>
    <text x="514" y="48" fill="#14211E" font-family="monospace" font-size="16" font-weight="700">${params.refCode}</text>
    <circle cx="320" cy="210" r="54" fill="${accent}" opacity="0.18"/>
    <circle cx="320" cy="210" r="32" fill="${accent}"/>
    <text x="320" y="218" text-anchor="middle" fill="#14211E" font-family="sans-serif" font-size="22" font-weight="700">${params.isRepairPhoto ? 'FIXED' : '!'}</text>
    <text x="32" y="438" fill="#F7F5EF" font-family="sans-serif" font-size="22" font-weight="700">${params.title}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const INITIAL_SAMPLE_REPORTS: ReportRecord[] = [
  {
    id: 'rep-sample-1',
    refCode: 'FL-4K7Q2',
    idempotencyKey: 'idem-seed-fl-4k7q2',
    reporterDisplay: 'Anonymous resident',
    reporterResidentStatus: 'provided' as ResidentStatus,
    categoryId: 'roads',
    subCategory: 'Missing manhole cover',
    note: 'Open manhole cover on Herbert Macaulay Way near Sabo bus stop. Deep drop in the middle lane; motorcycles swerving.',
    lat: 6.5095,
    lng: 3.3711,
    accuracyM: 12,
    areaId: 'area-yaba-sample',
    areaName: 'Yaba LCDA (Sample Pilot Boundary)',
    streetLabel: 'Herbert Macaulay Way, Sabo, Yaba',
    roadOwner: 'state' as RoadOwner,
    severity: 'dangerous',
    isDangerous: true,
    status: 'in_progress',
    agencyId: 'agency-roads-sample',
    agencyName: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
    confirmationCount: 14,
    fixYesCount: 0,
    fixNoCount: 0,
    priorityScore: calculatePriorityScore({
      severity: 'dangerous',
      confirmations: 14,
      daysOpen: 4,
    }),
    photos: [
      buildCivicThumbnailSvg({
        title: 'Missing manhole cover · Sabo Yaba',
        category: 'roads',
        refCode: 'FL-4K7Q2',
      }),
    ],
    videoAttached: false,
    videoSyncStatus: 'none',
    exifStripped: true,
    isFlagged: false,
    flagReasons: [],
    createdAt: '2026-11-05T08:30:00Z',
    updatedAt: '2026-11-07T11:15:00Z',
    acknowledgedAt: '2026-11-05T14:20:00Z',
    fixedAt: null,
    verifiedAt: null,
    slaAckDays: 7,
    isOverdue: false,
    timeline: [
      {
        id: 'ev-1a',
        reportId: 'rep-sample-1',
        fromStatus: null,
        toStatus: 'reported',
        agencyName: 'Fix Lagos Automated Router',
        note: 'Report received and routed to Lagos Roads Maintenance Team (Sample Pilot Agency).',
        createdAt: '2026-11-05T08:30:00Z',
      },
      {
        id: 'ev-1b',
        reportId: 'rep-sample-1',
        fromStatus: 'reported',
        toStatus: 'acknowledged',
        agencyName: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
        note: 'Fault logged for emergency precast cover replacement.',
        createdAt: '2026-11-05T14:20:00Z',
      },
      {
        id: 'ev-1c',
        reportId: 'rep-sample-1',
        fromStatus: 'acknowledged',
        toStatus: 'in_progress',
        agencyName: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
        note: 'Safety cones placed around opening; replacement collar crew dispatched.',
        createdAt: '2026-11-07T11:15:00Z',
      },
    ],
  },
  {
    id: 'rep-sample-2',
    refCode: 'FL-8M2P9',
    idempotencyKey: 'idem-seed-fl-8m2p9',
    reporterDisplay: 'Ada (First-name opt-in)',
    reporterResidentStatus: 'none' as ResidentStatus,
    categoryId: 'drainage',
    subCategory: 'Blocked drain',
    note: 'Side culvert completely silted with plastic debris opposite Tejuosho Market entrance. Water pools across both lanes when it rains.',
    lat: 6.5068,
    lng: 3.3682,
    accuracyM: 16,
    areaId: 'area-yaba-sample',
    areaName: 'Yaba LCDA (Sample Pilot Boundary)',
    streetLabel: 'Ojuelegba-Tejuosho Link Road, Yaba',
    roadOwner: 'state' as RoadOwner,
    severity: 'high',
    isDangerous: false,
    status: 'fixed',
    agencyId: 'agency-drainage-sample',
    agencyName: 'Drainage & Flood Control Office (Sample Pilot Agency)',
    confirmationCount: 9,
    fixYesCount: 1,
    fixNoCount: 0,
    priorityScore: calculatePriorityScore({
      severity: 'high',
      confirmations: 9,
      daysOpen: 5,
    }),
    photos: [
      buildCivicThumbnailSvg({
        title: 'Blocked drain · Tejuosho Link Road',
        category: 'drainage',
        refCode: 'FL-8M2P9',
      }),
    ],
    repairPhotoUrl: buildCivicThumbnailSvg({
      title: 'Desilted channel · Tejuosho Link Road',
      category: 'drainage',
      refCode: 'FL-8M2P9',
      isRepairPhoto: true,
    }),
    videoAttached: true,
    videoSyncStatus: 'synced',
    exifStripped: true,
    isFlagged: false,
    flagReasons: [],
    createdAt: '2026-11-04T09:10:00Z',
    updatedAt: '2026-11-08T16:40:00Z',
    acknowledgedAt: '2026-11-05T10:00:00Z',
    fixedAt: '2026-11-08T16:40:00Z',
    verifiedAt: null,
    slaAckDays: 7,
    isOverdue: false,
    timeline: [
      {
        id: 'ev-2a',
        reportId: 'rep-sample-2',
        fromStatus: null,
        toStatus: 'reported',
        agencyName: 'Fix Lagos Automated Router',
        note: 'Report routed to Drainage & Flood Control Office (Sample Pilot Agency).',
        createdAt: '2026-11-04T09:10:00Z',
      },
      {
        id: 'ev-2b',
        reportId: 'rep-sample-2',
        fromStatus: 'reported',
        toStatus: 'acknowledged',
        agencyName: 'Drainage & Flood Control Office (Sample Pilot Agency)',
        note: 'Scheduled for desilting crew on Saturday morning.',
        createdAt: '2026-11-05T10:00:00Z',
      },
      {
        id: 'ev-2c',
        reportId: 'rep-sample-2',
        fromStatus: 'acknowledged',
        toStatus: 'fixed',
        agencyName: 'Drainage & Flood Control Office (Sample Pilot Agency)',
        note: 'Culvert cleared and silt evacuated. Waiting for 2 nearby citizen confirmations.',
        photoUrl: buildCivicThumbnailSvg({
          title: 'Desilted channel · Tejuosho Link Road',
          category: 'drainage',
          refCode: 'FL-8M2P9',
          isRepairPhoto: true,
        }),
        createdAt: '2026-11-08T16:40:00Z',
      },
    ],
  },
  {
    id: 'rep-sample-3',
    refCode: 'FL-9T3W6',
    idempotencyKey: 'idem-seed-fl-9t3w6',
    reporterDisplay: 'Anonymous resident',
    reporterResidentStatus: 'provided' as ResidentStatus,
    categoryId: 'street_lights',
    subCategory: 'Light not working',
    note: 'Four consecutive street light poles dark along Bode Thomas Street near the pedestrian crossing. Very dark after 7pm.',
    lat: 6.4922,
    lng: 3.3541,
    accuracyM: 18,
    areaId: 'area-surulere-sample',
    areaName: 'Surulere LGA (Sample Pilot Boundary)',
    streetLabel: 'Bode Thomas Street, Surulere',
    roadOwner: 'state' as RoadOwner,
    severity: 'medium',
    isDangerous: false,
    status: 'reported',
    agencyId: 'agency-lights-sample',
    agencyName: 'Street Lighting & Power Unit (Sample Pilot Agency)',
    confirmationCount: 11,
    fixYesCount: 0,
    fixNoCount: 0,
    priorityScore: calculatePriorityScore({
      severity: 'medium',
      confirmations: 11,
      daysOpen: 9,
    }),
    photos: [
      buildCivicThumbnailSvg({
        title: 'Dark street lights · Bode Thomas',
        category: 'street_lights',
        refCode: 'FL-9T3W6',
      }),
    ],
    videoAttached: false,
    videoSyncStatus: 'none',
    exifStripped: true,
    isFlagged: false,
    flagReasons: [],
    createdAt: '2026-10-31T19:45:00Z',
    updatedAt: '2026-10-31T19:45:00Z',
    acknowledgedAt: null,
    fixedAt: null,
    verifiedAt: null,
    slaAckDays: 7,
    isOverdue: true, // Open > 7 days without acknowledgement (STA-03)
    timeline: [
      {
        id: 'ev-3a',
        reportId: 'rep-sample-3',
        fromStatus: null,
        toStatus: 'reported',
        agencyName: 'Fix Lagos Automated Router',
        note: 'Routed to Street Lighting & Power Unit (Sample Pilot Agency). Target acknowledgement: 7 days.',
        createdAt: '2026-10-31T19:45:00Z',
      },
    ],
  },
  {
    id: 'rep-sample-4',
    refCode: 'FL-2N6V4',
    idempotencyKey: 'idem-seed-fl-2n6v4',
    reporterDisplay: 'Anonymous resident',
    reporterResidentStatus: 'none' as ResidentStatus,
    categoryId: 'roads',
    subCategory: 'Pothole',
    note: 'Wide crater across the right lane just before Montgomery Road junction in Yaba. Causes heavy braking.',
    lat: 6.5096,
    lng: 3.3712, // Within 20m of FL-4K7Q2 to demonstrate 30m duplicate nudge (REP-07)
    accuracyM: 11,
    areaId: 'area-yaba-sample',
    areaName: 'Yaba LCDA (Sample Pilot Boundary)',
    streetLabel: 'Montgomery Road Junction, Yaba',
    roadOwner: 'state' as RoadOwner,
    severity: 'high',
    isDangerous: false,
    status: 'acknowledged',
    agencyId: 'agency-roads-sample',
    agencyName: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
    confirmationCount: 6,
    fixYesCount: 0,
    fixNoCount: 0,
    priorityScore: calculatePriorityScore({
      severity: 'high',
      confirmations: 6,
      daysOpen: 3,
    }),
    photos: [
      buildCivicThumbnailSvg({
        title: 'Deep pothole · Montgomery Rd Yaba',
        category: 'roads',
        refCode: 'FL-2N6V4',
      }),
    ],
    videoAttached: false,
    videoSyncStatus: 'none',
    exifStripped: true,
    isFlagged: false,
    flagReasons: [],
    createdAt: '2026-11-06T07:50:00Z',
    updatedAt: '2026-11-07T09:10:00Z',
    acknowledgedAt: '2026-11-07T09:10:00Z',
    fixedAt: null,
    verifiedAt: null,
    slaAckDays: 7,
    isOverdue: false,
    timeline: [
      {
        id: 'ev-4a',
        reportId: 'rep-sample-4',
        fromStatus: null,
        toStatus: 'reported',
        agencyName: 'Fix Lagos Automated Router',
        note: 'Routed to Lagos Roads Maintenance Team (Sample Pilot Agency).',
        createdAt: '2026-11-06T07:50:00Z',
      },
      {
        id: 'ev-4b',
        reportId: 'rep-sample-4',
        fromStatus: 'reported',
        toStatus: 'acknowledged',
        agencyName: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
        note: 'Added to Yaba asphalt patching batch.',
        createdAt: '2026-11-07T09:10:00Z',
      },
    ],
  },
  {
    id: 'rep-sample-5',
    refCode: 'FL-7H5R8',
    idempotencyKey: 'idem-seed-fl-7h5r8',
    reporterDisplay: 'Bello (First-name opt-in)',
    reporterResidentStatus: 'provided' as ResidentStatus,
    categoryId: 'roads',
    subCategory: 'Pothole',
    note: 'Patched surface at Adeniran Ogunsanya shopping strip confirmed smooth and dry after rain.',
    lat: 6.4955,
    lng: 3.3562,
    accuracyM: 10,
    areaId: 'area-surulere-sample',
    areaName: 'Surulere LGA (Sample Pilot Boundary)',
    streetLabel: 'Adeniran Ogunsanya Street, Surulere',
    roadOwner: 'state' as RoadOwner,
    severity: 'medium',
    isDangerous: false,
    status: 'verified',
    agencyId: 'agency-roads-sample',
    agencyName: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
    confirmationCount: 8,
    fixYesCount: 3,
    fixNoCount: 0,
    priorityScore: calculatePriorityScore({
      severity: 'medium',
      confirmations: 8,
      daysOpen: 6,
    }),
    photos: [
      buildCivicThumbnailSvg({
        title: 'Road crater · Adeniran Ogunsanya',
        category: 'roads',
        refCode: 'FL-7H5R8',
      }),
    ],
    repairPhotoUrl: buildCivicThumbnailSvg({
      title: 'Asphalt patch verified · Surulere',
      category: 'roads',
      refCode: 'FL-7H5R8',
      isRepairPhoto: true,
    }),
    videoAttached: false,
    videoSyncStatus: 'none',
    exifStripped: true,
    isFlagged: false,
    flagReasons: [],
    createdAt: '2026-11-01T11:00:00Z',
    updatedAt: '2026-11-06T17:30:00Z',
    acknowledgedAt: '2026-11-02T09:00:00Z',
    fixedAt: '2026-11-05T15:00:00Z',
    verifiedAt: '2026-11-06T17:30:00Z',
    slaAckDays: 7,
    isOverdue: false,
    timeline: [
      {
        id: 'ev-5a',
        reportId: 'rep-sample-5',
        fromStatus: null,
        toStatus: 'reported',
        agencyName: 'Fix Lagos Automated Router',
        note: 'Routed to Lagos Roads Maintenance Team (Sample Pilot Agency).',
        createdAt: '2026-11-01T11:00:00Z',
      },
      {
        id: 'ev-5b',
        reportId: 'rep-sample-5',
        fromStatus: 'reported',
        toStatus: 'acknowledged',
        agencyName: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
        note: 'Inspection completed.',
        createdAt: '2026-11-02T09:00:00Z',
      },
      {
        id: 'ev-5c',
        reportId: 'rep-sample-5',
        fromStatus: 'acknowledged',
        toStatus: 'fixed',
        agencyName: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
        note: 'Hot-mix asphalt laid and compacted.',
        createdAt: '2026-11-05T15:00:00Z',
      },
      {
        id: 'ev-5d',
        reportId: 'rep-sample-5',
        fromStatus: 'fixed',
        toStatus: 'verified',
        agencyName: 'Community Verification (3 nearby residents)',
        note: 'Verified fixed by reporter and 2 residents within 200 m.',
        createdAt: '2026-11-06T17:30:00Z',
      },
    ],
  },
  {
    id: 'rep-sample-6',
    refCode: 'FL-5C9J3',
    idempotencyKey: 'idem-seed-fl-5c9j3',
    reporterDisplay: 'Anonymous resident',
    reporterResidentStatus: 'none' as ResidentStatus,
    categoryId: 'roads',
    subCategory: 'Collapsed road',
    note: 'Boundary slip road edge eroded near canal bridge; unclear whether federal highway or state road.',
    lat: 6.5965,
    lng: 3.3515,
    accuracyM: 21,
    areaId: 'area-ikeja-sample',
    areaName: 'Ikeja LGA (Sample Boundary)',
    streetLabel: 'Obafemi Awolowo Way Slip Road, Ikeja',
    roadOwner: 'unknown' as RoadOwner, // Triggers RTE-03 Moderator Triage Queue
    severity: 'high',
    isDangerous: false,
    status: 'reported',
    agencyId: null,
    agencyName: 'Moderator Triage Queue',
    confirmationCount: 4,
    fixYesCount: 0,
    fixNoCount: 0,
    priorityScore: calculatePriorityScore({
      severity: 'high',
      confirmations: 4,
      daysOpen: 1,
    }),
    photos: [
      buildCivicThumbnailSvg({
        title: 'Unrouted road edge · Ikeja Slip Rd',
        category: 'roads',
        refCode: 'FL-5C9J3',
      }),
    ],
    videoAttached: false,
    videoSyncStatus: 'none',
    exifStripped: true,
    isFlagged: false,
    flagReasons: [],
    createdAt: '2026-11-08T12:15:00Z',
    updatedAt: '2026-11-08T12:15:00Z',
    acknowledgedAt: null,
    fixedAt: null,
    verifiedAt: null,
    slaAckDays: 7,
    isOverdue: false,
    timeline: [
      {
        id: 'ev-6a',
        reportId: 'rep-sample-6',
        fromStatus: null,
        toStatus: 'reported',
        agencyName: 'Moderator Triage Queue',
        note: 'Road ownership unknown — held in Moderator Triage Queue for agency assignment (RTE-03).',
        createdAt: '2026-11-08T12:15:00Z',
      },
    ],
  },
];

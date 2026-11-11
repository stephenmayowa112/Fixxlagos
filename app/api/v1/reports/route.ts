import { NextRequest, NextResponse } from 'next/server';
import {
  CreateReportInputSchema,
  type ApiErrorEnvelope,
  type ReportRecord,
} from '../../../../packages/api-client/src/index';
import {
  calculatePriorityScore,
  generateRefCode,
  resolveRoutingRule,
  shouldPublishImmediately,
} from '../../../../lib/domain';
import {
  INITIAL_SAMPLE_REPORTS,
  SAMPLE_AGENCIES,
  SAMPLE_PILOT_AREAS,
  SAMPLE_ROUTING_RULES,
} from '../../../../lib/seed-data';

// Server-side in-memory store seeded with Sample Pilot Data + Idempotency Key registry
const serverReports: ReportRecord[] = [...INITIAL_SAMPLE_REPORTS];
const idempotencyRegistry = new Map<string, ReportRecord>();
const dailyRateLimitCounter = new Map<string, number>();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const status = searchParams.get('status');
  const area = searchParams.get('area');

  let filtered = [...serverReports];
  if (category && category !== 'all') {
    filtered = filtered.filter((r) => r.categoryId === category);
  }
  if (status && status !== 'all') {
    filtered = filtered.filter((r) => r.status === status);
  }
  if (area && area !== 'all') {
    filtered = filtered.filter((r) => r.areaId === area);
  }

  return NextResponse.json({
    data: filtered,
    nextCursor: null,
  });
}

export async function POST(req: NextRequest) {
  const idempotencyKey = req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key');
  if (!idempotencyKey) {
    const err: ApiErrorEnvelope = {
      error: {
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header is required on report creation (REP-08).',
        suggestedFix: 'Include a unique UUID in the Idempotency-Key request header.',
      },
    };
    return NextResponse.json(err, { status: 400 });
  }

  // Return existing report if idempotency key was already processed (REP-08)
  const existing = idempotencyRegistry.get(idempotencyKey);
  if (existing) {
    return NextResponse.json({ data: existing, deduplicated: true }, { status: 200 });
  }

  const clientKey = req.headers.get('x-reporter-hash') || 'anonymous-session';
  const countToday = dailyRateLimitCounter.get(clientKey) ?? 0;
  if (countToday >= 10) {
    const err: ApiErrorEnvelope = {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'You have reached the daily limit of 10 reports per day (REP-10).',
        suggestedFix: 'Wait until tomorrow or confirm an existing nearby report instead.',
      },
    };
    return NextResponse.json(err, { status: 429 });
  }

  const body = await req.json();
  const parsed = CreateReportInputSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      fieldErrors[key] = issue.message;
    }
    const err: ApiErrorEnvelope = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the highlighted fields in your report.',
        suggestedFix: Object.values(fieldErrors)[0] || 'Review required fields and try again.',
        fieldErrors,
      },
    };
    return NextResponse.json(err, { status: 422 });
  }

  const input = parsed.data;
  const routing = resolveRoutingRule(SAMPLE_ROUTING_RULES, SAMPLE_AGENCIES, {
    categoryId: input.categoryId,
    areaId: input.areaId,
    roadOwner: input.roadOwner,
  });

  const areaObj =
    SAMPLE_PILOT_AREAS.find((a) => a.id === input.areaId) ?? SAMPLE_PILOT_AREAS[0];
  const severity = input.isDangerous
    ? 'dangerous'
    : input.categoryId === 'roads' || input.categoryId === 'drainage'
      ? 'high'
      : 'medium';

  const verifiedCount = Number(body.userVerifiedReportCount ?? 3);
  const initialStatus = shouldPublishImmediately(verifiedCount)
    ? 'reported'
    : 'pending_review';

  const refCode = generateRefCode();
  const nowIso = new Date().toISOString();

  const created: ReportRecord = {
    id: `rep-${Date.now()}`,
    refCode,
    idempotencyKey,
    reporterDisplay: body.reporterDisplay || 'Anonymous resident',
    reporterResidentStatus: body.reporterResidentStatus || 'none',
    categoryId: input.categoryId,
    subCategory: input.subCategory,
    note: input.note || '',
    lat: input.lat,
    lng: input.lng,
    accuracyM: input.accuracyM,
    areaId: areaObj.id,
    areaName: areaObj.name,
    streetLabel: input.streetLabel,
    roadOwner: input.roadOwner,
    severity,
    isDangerous: input.isDangerous,
    status: initialStatus,
    agencyId: routing.agencyId,
    agencyName: routing.agencyName,
    confirmationCount: 1,
    fixYesCount: 0,
    fixNoCount: 0,
    priorityScore: calculatePriorityScore({
      severity,
      confirmations: 1,
      daysOpen: 0,
    }),
    photos: input.photos,
    videoAttached: input.videoAttached,
    videoSyncStatus: input.videoAttached ? 'synced' : 'none',
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
        reportId: refCode,
        fromStatus: null,
        toStatus: initialStatus,
        agencyName: routing.agencyName,
        note:
          initialStatus === 'pending_review'
            ? 'Report received from new account and held for quick moderator review (Section 5.5).'
            : `Report published and routed to ${routing.agencyName}.`,
        createdAt: nowIso,
      },
    ],
  };

  serverReports.unshift(created);
  idempotencyRegistry.set(idempotencyKey, created);
  dailyRateLimitCounter.set(clientKey, countToday + 1);

  return NextResponse.json({ data: created, deduplicated: false }, { status: 201 });
}

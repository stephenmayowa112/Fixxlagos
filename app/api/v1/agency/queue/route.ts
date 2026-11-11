import { NextRequest, NextResponse } from 'next/server';
import type {
  CategoryGroup,
  CitizenStatus,
  ResidentStatus,
  SeverityLevel,
} from '@/packages/api-client/src/index';
import type { UserRole } from '@/lib/phase1-core';
import { globalPhase3Engine } from '@/lib/phase3-core';

/**
 * GET /api/v1/agency/queue
 * Implements AGD-01 & LRS-06: Agency queue with filters sorted by priority score.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agencyId = searchParams.get('agencyId') || 'all';
  const status = (searchParams.get('status') || 'all') as CitizenStatus | 'all';
  const category = (searchParams.get('category') || 'all') as CategoryGroup | 'all';
  const areaId = searchParams.get('areaId') || 'all';
  const severity = (searchParams.get('severity') || 'all') as SeverityLevel | 'all';
  const residentStatus = (searchParams.get('residentStatus') || 'all') as
    | ResidentStatus
    | 'all';
  const overdueOnly = searchParams.get('overdueOnly') === 'true';

  const items = globalPhase3Engine.queryAgencyQueue({
    agencyId,
    status,
    category,
    areaId,
    severity,
    residentStatus,
    overdueOnly,
  });

  return NextResponse.json({
    data: items,
    meta: {
      total: items.length,
      overdueCount: items.filter((r) => r.isOverdue).length,
    },
  });
}

/**
 * POST /api/v1/agency/queue
 * Implements AGD-05: Bulk supervisor actions with full audit trail.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      refCodes?: string[];
      actorId?: string;
      actorRole?: UserRole;
      toStatus?: 'acknowledged' | 'in_progress';
      note?: string;
    };

    if (!body.refCodes || body.refCodes.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'EMPTY_BULK_SELECTION',
            message: 'Select at least one report in the queue to run a bulk action.',
          },
        },
        { status: 400 }
      );
    }

    const result = globalPhase3Engine.bulkSupervisorUpdate({
      refCodes: body.refCodes,
      actorId: body.actorId ?? 'supervisor-lagos-01',
      actorRole: body.actorRole ?? 'agency_supervisor',
      toStatus: body.toStatus ?? 'acknowledged',
      note: body.note ?? 'Bulk acknowledged by Agency Supervisor.',
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bulk action failed';
    const status = message.includes('Forbidden') ? 403 : 400;
    return NextResponse.json(
      { error: { code: 'BULK_ACTION_ERROR', message } },
      { status }
    );
  }
}

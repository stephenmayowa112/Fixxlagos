import { NextRequest, NextResponse } from 'next/server';
import type { CitizenStatus } from '@/packages/api-client/src/index';
import type { UserRole } from '@/lib/phase1-core';
import { globalPhase3Engine } from '@/lib/phase3-core';

/**
 * POST /api/v1/agency/reports/[ref]/status
 * Implements AGD-03, STA-01, STA-02, RTE-05 & NOT-01:
 * Acknowledge, assign team, update status, upload repair photo, reject with required public reason,
 * or return "not our responsibility" to the Moderator Triage Queue.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ ref: string }> }
) {
  try {
    const { ref } = await context.params;
    const body = (await req.json()) as {
      actorId?: string;
      actorRole?: UserRole;
      toStatus: CitizenStatus;
      note?: string;
      rejectionReason?: string;
      returnToModerator?: boolean;
      suggestedAgencyId?: string;
      attachRepairPhoto?: boolean;
      assignedTeamLabel?: string;
      watHour24?: number;
    };

    const result = globalPhase3Engine.updateReportStatusByAgency({
      refCode: ref,
      actorId: body.actorId ?? 'officer-lagos-01',
      actorRole: body.actorRole ?? 'agency_officer',
      toStatus: body.toStatus,
      note: body.note ?? 'Status updated by agency triage desk.',
      rejectionReason: body.rejectionReason,
      returnToModerator: body.returnToModerator,
      suggestedAgencyId: body.suggestedAgencyId,
      attachRepairPhoto: body.attachRepairPhoto,
      assignedTeamLabel: body.assignedTeamLabel,
      watHour24: body.watHour24,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Status update failed';
    const status = message.includes('Forbidden') ? 403 : 400;
    return NextResponse.json(
      { error: { code: 'AGENCY_STATUS_ERROR', message } },
      { status }
    );
  }
}

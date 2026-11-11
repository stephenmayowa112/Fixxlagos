import { NextRequest, NextResponse } from 'next/server';
import { FlagReasonSchema } from '@/packages/api-client/src/index';
import { globalPhase3Engine } from '@/lib/phase3-core';

/**
 * POST /api/v1/reports/[ref]/flags
 * Implements MOD-02: Any user can flag a report (not_infrastructure, abusive, personal_data, spam).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ ref: string }> }
) {
  try {
    const { ref } = await context.params;
    const body = (await req.json()) as {
      reporterUserId?: string;
      reason?: string;
      detail?: string;
    };

    const parsedReason = FlagReasonSchema.safeParse(body.reason);
    if (!parsedReason.success) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_FLAG_REASON',
            message:
              'Choose a valid flag reason: not_infrastructure, abusive, personal_data, or spam (MOD-02).',
          },
        },
        { status: 400 }
      );
    }

    const updated = globalPhase3Engine.flagReport({
      refCode: ref,
      reporterUserId: body.reporterUserId ?? 'usr-citizen-flagger',
      reason: parsedReason.data,
      detail: body.detail,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not flag report';
    return NextResponse.json(
      { error: { code: 'FLAG_ERROR', message } },
      { status: 400 }
    );
  }
}

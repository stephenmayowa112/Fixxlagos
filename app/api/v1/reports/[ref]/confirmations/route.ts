import { NextRequest, NextResponse } from 'next/server';
import type { ConfirmationKind } from '@/packages/api-client/src/index';
import { globalPhase2Engine } from '@/lib/phase2-core';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ ref: string }> }
) {
  try {
    const { ref } = await context.params;
    const body = await req.json();
    const {
      userId = 'usr-citizen-verifier',
      kind = 'see_too',
      userLat = 6.5095,
      userLng = 3.3711,
      isOriginalReporter = false,
      daysSinceFixed = 1,
    } = body as {
      userId?: string;
      kind?: ConfirmationKind;
      userLat?: number;
      userLng?: number;
      isOriginalReporter?: boolean;
      daysSinceFixed?: number;
    };

    const outcome = globalPhase2Engine.submitConfirmation({
      refCode: ref.toUpperCase(),
      userId,
      kind,
      userLat: Number(userLat),
      userLng: Number(userLng),
      isOriginalReporter: Boolean(isOriginalReporter),
      daysSinceFixed: Number(daysSinceFixed),
    });

    return NextResponse.json({
      data: outcome,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'CONFIRMATION_REJECTED',
          message:
            err instanceof Error
              ? err.message
              : 'Could not record confirmation on this report.',
        },
      },
      { status: 400 }
    );
  }
}

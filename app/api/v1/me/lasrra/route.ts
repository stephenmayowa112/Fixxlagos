import { NextRequest, NextResponse } from 'next/server';
import { globalPhase2Engine } from '../../../../../lib/phase2-core';
import type { UserRole } from '../../../../../lib/phase1-core';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId = 'usr-citizen-default',
      rawIdNumber = '',
      cardPhotoPresent = false,
      consentAccepted = false,
    } = body as {
      userId?: string;
      rawIdNumber?: string;
      cardPhotoPresent?: boolean;
      consentAccepted?: boolean;
    };

    const result = globalPhase2Engine.lasrraVault.submitOptionalLasrra({
      userId,
      rawIdNumber,
      cardPhotoPresent: Boolean(cardPhotoPresent),
      consentAccepted: Boolean(consentAccepted),
    });

    // LRS-11: Never return the raw ID number or card photo in API responses
    return NextResponse.json({
      data: {
        verificationId: result.verificationId,
        residentStatus: result.residentStatus,
        cardPhotoStoredPrivately: Boolean(result.privateCardPhotoKey),
        message:
          'Optional LASRRA ID encrypted at rest. Status badge set to ID provided (LRS-03, LRS-08).',
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'LASRRA_SUBMISSION_ERROR',
          message:
            err instanceof Error ? err.message : 'Could not save LASRRA record.',
        },
      },
      { status: 400 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId = 'usr-citizen-default',
      moderatorId = 'mod-lagos-01',
      moderatorRole = 'moderator',
      plausible = true,
    } = body as {
      userId?: string;
      moderatorId?: string;
      moderatorRole?: UserRole;
      plausible?: boolean;
    };

    const reviewed =
      globalPhase2Engine.lasrraVault.completeModeratorPlausibilityReview({
        userId,
        moderatorId,
        moderatorRole,
        plausible: Boolean(plausible),
      });

    return NextResponse.json({
      data: {
        verificationId: reviewed.verificationId,
        status: reviewed.status,
        cardPhotoDeleted: reviewed.cardPhotoDeleted,
        auditLogCount: globalPhase2Engine.lasrraVault.auditLogs.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'LASRRA_REVIEW_ERROR',
          message:
            err instanceof Error
              ? err.message
              : 'Could not complete LASRRA plausibility review.',
        },
      },
      { status: 403 }
    );
  }
}

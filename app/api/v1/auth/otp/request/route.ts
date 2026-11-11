import { NextRequest, NextResponse } from 'next/server';
import { globalOtpAuthService } from '../../../../../../lib/phase1-core';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = globalOtpAuthService.requestOtp(String(body.phone || ''));
    return NextResponse.json({
      data: {
        phoneNormalized: result.phoneNormalized,
        expiresInSeconds: result.expiresInSeconds,
        resendAfterSeconds: result.resendAfterSeconds,
        smsReceipt: result.smsReceipt,
        devCodeHint: result.devCodePreview,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'OTP_REQUEST_FAILED',
          message: err instanceof Error ? err.message : 'Could not send SMS OTP',
        },
      },
      { status: 400 }
    );
  }
}

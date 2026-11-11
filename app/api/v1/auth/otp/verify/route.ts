import { NextRequest, NextResponse } from 'next/server';
import { globalOtpAuthService } from '../../../../../../lib/phase1-core';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const verified = globalOtpAuthService.verifyOtp(
      String(body.phone || ''),
      String(body.code || '')
    );
    const response = NextResponse.json({
      data: {
        userId: verified.userId,
        phoneHash: verified.phoneHash,
        role: verified.role,
        accessToken: verified.accessToken,
      },
    });
    response.cookies.set('fixlagos_refresh', verified.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 14,
    });
    return response;
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'OTP_VERIFY_FAILED',
          message: err instanceof Error ? err.message : 'Invalid or expired OTP code',
        },
      },
      { status: 401 }
    );
  }
}

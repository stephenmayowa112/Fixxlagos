import { NextRequest, NextResponse } from 'next/server';
import { globalPhase3Engine } from '@/lib/phase3-core';

/**
 * PATCH /api/v1/me/settings
 * Implements NOT-01, NOT-02, NOT-04 & ACC-05:
 * Citizen notification preferences (SMS opt-out, Web Push toggle, 21:00-07:00 WAT quiet hours).
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      userId?: string;
      smsEnabled?: boolean;
      webPushEnabled?: boolean;
      quietHoursEnabled?: boolean;
    };

    const updated = globalPhase3Engine.updateUserNotificationSettings({
      userId: body.userId ?? 'usr-citizen-default',
      smsEnabled: body.smsEnabled ?? true,
      webPushEnabled: body.webPushEnabled ?? true,
      quietHoursEnabled: body.quietHoursEnabled ?? true,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to update settings';
    return NextResponse.json(
      { error: { code: 'SETTINGS_UPDATE_ERROR', message } },
      { status: 400 }
    );
  }
}

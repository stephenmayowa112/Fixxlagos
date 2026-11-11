import { NextResponse } from 'next/server';
import { globalPhase3Engine } from '@/lib/phase3-core';

/**
 * GET /api/v1/me/notifications
 * Implements NOT-01..05: Citizen SMS and In-App notification inbox with quiet hours status.
 */
export async function GET() {
  return NextResponse.json({
    data: globalPhase3Engine.citizenNotifications,
    agencyAlerts: globalPhase3Engine.agencyAlerts,
  });
}

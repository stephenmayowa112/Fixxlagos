import { NextRequest, NextResponse } from 'next/server';
import { globalPhase3Engine } from '@/lib/phase3-core';

/**
 * GET /api/v1/agency/analytics
 * Implements AGD-04: Reports by category and area, median time to acknowledge and to fix,
 * overdue count, hotspot heatmap summary, and monthly trend.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agencyId = searchParams.get('agencyId') || 'all';
  const analytics = globalPhase3Engine.computeAgencyAnalytics(agencyId);

  return NextResponse.json({
    data: analytics,
  });
}

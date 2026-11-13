import { NextResponse } from 'next/server';
import { getProductionHealthSummary } from '@/lib/phase4-production';

/**
 * GET /api/v1/health
 * Production uptime, PostGIS/storage readiness, backup restore verification,
 * and NDPA 2023 compliance status endpoint (PRD Section 8 & Section 11).
 */
export async function GET() {
  const summary = getProductionHealthSummary();
  return NextResponse.json({
    data: summary,
  });
}

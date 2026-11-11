import { NextRequest, NextResponse } from 'next/server';
import { globalPhase3Engine } from '@/lib/phase3-core';

/**
 * GET /api/v1/public/areas/[id]/summary
 * Implements TRN-01 & TRN-02: Public transparency page per area showing counts by status,
 * median response time per agency, zero individual official names, and shareable preview SVG.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const summary = globalPhase3Engine.getPublicAreaTransparencySummary(id || 'all');

  return NextResponse.json({
    data: summary,
  });
}

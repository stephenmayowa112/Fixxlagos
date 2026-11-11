import { NextRequest, NextResponse } from 'next/server';
import type { CategoryGroup } from '@/packages/api-client/src/index';
import { globalPhase2Engine } from '@/lib/phase2-core';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = (searchParams.get('category') || 'roads') as CategoryGroup;
  const lat = Number(searchParams.get('lat') || 6.5095);
  const lng = Number(searchParams.get('lng') || 3.3711);

  const candidates = globalPhase2Engine.findSimilarWithin30m(category, lat, lng);

  return NextResponse.json({
    data: {
      radiusMeters: 30,
      count: candidates.length,
      items: candidates.map((c) => ({
        distanceM: c.distanceM,
        report: c.report,
      })),
    },
  });
}

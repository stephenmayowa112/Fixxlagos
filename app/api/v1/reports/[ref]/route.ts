import { NextRequest, NextResponse } from 'next/server';
import { globalPhase2Engine } from '@/lib/phase2-core';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ ref: string }> }
) {
  const { ref } = await context.params;
  const report = globalPhase2Engine.getReportByRef(ref.toUpperCase());

  if (!report) {
    return NextResponse.json(
      {
        error: {
          code: 'REPORT_NOT_FOUND',
          message: `Report ${ref} was not found.`,
        },
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    data: report,
  });
}

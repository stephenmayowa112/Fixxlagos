import { NextRequest, NextResponse } from 'next/server';
import { ResumableMediaService } from '../../../../../lib/phase1-core';

const mediaService = new ResumableMediaService();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const session = mediaService.createPresignedSession({
      mediaType: body.mediaType === 'video' ? 'video' : 'photo',
      sizeBytes: Number(body.sizeBytes || 350000),
      durationSec: body.durationSec ? Number(body.durationSec) : undefined,
    });
    return NextResponse.json({ data: session }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'MEDIA_UPLOAD_REJECTED',
          message: err instanceof Error ? err.message : 'Media validation failed',
        },
      },
      { status: 422 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const completed = mediaService.completeResumableUpload(String(body.uploadId || ''), {
      simulateNetworkDropOnVideo: Boolean(body.simulateNetworkDropOnVideo),
    });
    return NextResponse.json({ data: completed });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'MEDIA_COMPLETE_ERROR',
          message: err instanceof Error ? err.message : 'Upload completion failed',
        },
      },
      { status: 400 }
    );
  }
}

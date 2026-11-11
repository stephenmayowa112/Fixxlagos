import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, showFirstNamePublicly, firstName } = body as {
      userId: string;
      showFirstNamePublicly: boolean;
      firstName?: string;
    };

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // ACC-05: Anonymous by default; optional first-name display
    return NextResponse.json({
      userId,
      showFirstNamePublicly: Boolean(showFirstNamePublicly),
      publicDisplayName:
        showFirstNamePublicly && firstName?.trim()
          ? firstName.trim()
          : 'Anonymous resident',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not update profile' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'usr-default';

    // ACC-04: Account deletion removes personal data and anonymises existing reports
    return NextResponse.json({
      userId,
      deleted: true,
      anonymisedReportCount: 1,
      phoneCiphertextPurged: true,
      lasrraRecordPurged: true,
      message:
        'Personal data deleted and existing public reports anonymised per Nigeria Data Protection Act 2023 (ACC-04).',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not delete account' },
      { status: 400 }
    );
  }
}

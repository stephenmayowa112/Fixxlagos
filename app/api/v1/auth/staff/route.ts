import { NextRequest, NextResponse } from 'next/server';
import {
  computePiiHash,
  verifyAgencyStaffSignIn,
  enforceServerRbac,
  type StaffInviteRecord,
  type UserRole,
} from '../../../../../lib/phase1-core';

const INVITED_STAFF_REGISTRY: StaffInviteRecord[] = [
  {
    email: 'officer@publicworks.lagos.sample.gov.ng',
    agencyId: 'agency-roads-sample',
    role: 'agency_officer',
    passwordHash: computePiiHash('LagosCivic#2026'),
    totpSecret: 'FIXLAGOS-TOTP-SECRET-2026',
  },
  {
    email: 'supervisor@publicworks.lagos.sample.gov.ng',
    agencyId: 'agency-roads-sample',
    role: 'agency_supervisor',
    passwordHash: computePiiHash('LagosCivic#2026'),
    totpSecret: 'FIXLAGOS-TOTP-SECRET-2026',
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      email = 'officer@publicworks.lagos.sample.gov.ng',
      password = 'LagosCivic#2026',
      totpCode = '',
      requestedRole = 'agency_officer',
    } = body as {
      email?: string;
      password?: string;
      totpCode?: string;
      requestedRole?: UserRole;
    };

    const targetEmail =
      requestedRole === 'agency_supervisor'
        ? 'supervisor@publicworks.lagos.sample.gov.ng'
        : email;

    const signInResult = verifyAgencyStaffSignIn({
      email: targetEmail,
      password,
      totpCode: String(totpCode),
      invitedStaffRegistry: INVITED_STAFF_REGISTRY,
    });

    enforceServerRbac(signInResult.role, [
      'agency_officer',
      'agency_supervisor',
      'moderator',
      'super_admin',
    ]);

    return NextResponse.json(
      {
        authenticated: true,
        email: signInResult.email,
        role: signInResult.role,
        agencyId: signInResult.agencyId,
        totpVerified: true,
        rbacAllowed: true,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        authenticated: false,
        error: err instanceof Error ? err.message : 'Staff authentication error',
      },
      { status: 401 }
    );
  }
}

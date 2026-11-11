import { NextRequest, NextResponse } from 'next/server';
import type { CategoryGroup, RoadOwner } from '@/packages/api-client/src/index';
import type { UserRole } from '@/lib/phase1-core';
import { globalPhase3Engine } from '@/lib/phase3-core';

/**
 * GET /api/v1/admin/routing-rules
 * Returns live agencies, pilot areas, routing rules, and audit logs (MOD-05, RTE-01..02).
 */
export async function GET() {
  return NextResponse.json({
    data: {
      routingRules: globalPhase3Engine.getRoutingRules(),
      agencies: globalPhase3Engine.getAgencies(),
      areas: globalPhase3Engine.getAreas(),
      auditLogs: globalPhase3Engine.auditLogs,
    },
  });
}

/**
 * POST /api/v1/admin/routing-rules
 * Implements MOD-05 & RTE-02: Admin adds or updates a routing rule without code changes.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      adminId?: string;
      adminRole?: UserRole;
      categoryId: CategoryGroup;
      areaId: string;
      roadOwner: Exclude<RoadOwner, 'unknown'>;
      agencyId: string;
      priority?: number;
    };

    const rule = globalPhase3Engine.upsertRoutingRuleWithoutCodeChange({
      adminId: body.adminId ?? 'admin-lagos-01',
      adminRole: body.adminRole ?? 'super_admin',
      categoryId: body.categoryId,
      areaId: body.areaId,
      roadOwner: body.roadOwner,
      agencyId: body.agencyId,
      priority: body.priority,
    });

    return NextResponse.json({
      data: {
        rule,
        routingRules: globalPhase3Engine.getRoutingRules(),
        auditLogs: globalPhase3Engine.auditLogs,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to update routing rule';
    const status = message.includes('Forbidden') ? 403 : 400;
    return NextResponse.json(
      { error: { code: 'ROUTING_RULE_ADMIN_ERROR', message } },
      { status }
    );
  }
}

/**
 * PUT /api/v1/admin/routing-rules
 * Implements MOD-03 (Merge Duplicates) & MOD-04 (Rate-limit/ban user or hide abusive content).
 */
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      actionType: 'MERGE_DUPLICATES' | 'MODERATE_USER_OR_CONTENT';
      moderatorId?: string;
      moderatorRole?: UserRole;
      firstRef?: string;
      secondRef?: string;
      targetUserId?: string;
      userAction?: 'rate_limited' | 'banned';
      hideReportRef?: string;
      reason?: string;
    };

    if (body.actionType === 'MERGE_DUPLICATES') {
      const merged = globalPhase3Engine.mergeDuplicateReports({
        firstRef: body.firstRef ?? 'FL-2N6V4',
        secondRef: body.secondRef ?? 'FL-4K7Q2',
        moderatorId: body.moderatorId ?? 'mod-lagos-01',
        moderatorRole: body.moderatorRole ?? 'moderator',
      });
      return NextResponse.json({
        data: merged,
        auditLogs: globalPhase3Engine.auditLogs,
      });
    }

    const moderated = globalPhase3Engine.moderateUserOrContent({
      moderatorId: body.moderatorId ?? 'mod-lagos-01',
      moderatorRole: body.moderatorRole ?? 'moderator',
      targetUserId: body.targetUserId,
      userAction: body.userAction,
      hideReportRef: body.hideReportRef,
      reason: body.reason ?? 'Policy enforcement (MOD-04)',
    });

    return NextResponse.json({
      data: moderated,
      auditLogs: globalPhase3Engine.auditLogs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Moderation action failed';
    const status = message.includes('Forbidden') ? 403 : 400;
    return NextResponse.json(
      { error: { code: 'MODERATION_ACTION_ERROR', message } },
      { status }
    );
  }
}

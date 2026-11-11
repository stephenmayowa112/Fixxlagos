'use client';

import React, { useEffect, useState } from 'react';
import {
  Camera,
  MapPin,
  FileText,
  Bell,
  User,
  Shield,
  BarChart3,
  ThumbsUp,
  WifiOff,
  Wifi,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Trash2,
  CreditCard,
  Download,
  Building2,
} from 'lucide-react';
import type {
  CategoryGroup,
  CitizenStatus,
  FlagReason,
  ReportRecord,
  ResidentStatus,
  RoadOwner,
} from '../packages/api-client/src/index';
import {
  INITIAL_SAMPLE_REPORTS,
  SAMPLE_AGENCIES,
  SAMPLE_PILOT_AREAS,
  SAMPLE_ROUTING_RULES,
  buildCivicThumbnailSvg,
} from '../lib/seed-data';
import {
  calculatePriorityScore,
  evaluateFixVerificationState,
  formatWatDate,
  generateRefCode,
  resolveRoutingRule,
} from '../lib/domain';
import {
  listOfflineDrafts,
  removeOfflineDraft,
  saveOfflineDraft,
  type OfflineDraftRecord,
} from '../lib/offline-drafts';
import { usePWAInstall } from '../hooks/use-pwa-install';
import {
  StatusBadge,
  ResidentStatusBadge,
  CategoryIcon,
  getCategoryLabel,
} from '../components/status-badges';
import { LagosVectorMap } from '../components/lagos-vector-map';
import { ReportWizardModal } from '../components/report-wizard-modal';
import { ReportDetailDrawer } from '../components/report-detail-drawer';
import {
  AgencyDashboardView,
  ModeratorConsoleView,
  PublicTransparencyView,
  type AuditLogItem,
} from '../components/agency-and-admin-views';

type ActiveWorkspaceTab =
  | 'map_feed'
  | 'my_reports'
  | 'alerts'
  | 'profile'
  | 'agency'
  | 'moderator'
  | 'transparency';

interface NotificationMessage {
  id: string;
  channel: 'SMS' | 'In-App';
  refCode: string;
  agencyName: string;
  text: string;
  createdAt: string;
  unread: boolean;
}

export default function FixLagosHomePage() {
  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>('map_feed');
  const [reports, setReports] = useState<ReportRecord[]>(INITIAL_SAMPLE_REPORTS);

  // Filters & sorting for Map & Feed (MAP-01..05)
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'nearest' | 'newest' | 'priority'>('priority');
  const [nearMeRadiusKm, setNearMeRadiusKm] = useState<number>(2);
  const [mobileSubView, setMobileSubView] = useState<'split' | 'list_only'>('split');

  // Low-data mode & Offline mode (MAP-05, REP-08)
  const [lowDataMode, setLowDataMode] = useState<boolean>(false);
  const [isOfflineSimulated, setIsOfflineSimulated] = useState<boolean>(false);
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineDraftRecord[]>([]);
  const [syncingDrafts, setSyncingDrafts] = useState<boolean>(false);

  // Progressive Citizen Account State (ACC-01..05, LRS-01..13)
  const [isSignedIn, setIsSignedIn] = useState<boolean>(false);
  const [userPhone, setUserPhone] = useState<string>('');
  const [firstNameOptIn, setFirstNameOptIn] = useState<boolean>(false);
  const [firstName, setFirstName] = useState<string>('Ada');
  const [residentStatus, setResidentStatus] = useState<ResidentStatus>('none');
  const [hasSeenLasrraPrompt, setHasSeenLasrraPrompt] = useState<boolean>(false);
  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState<boolean>(true);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState<boolean>(true);
  const [userConfirmedRefs, setUserConfirmedRefs] = useState<string[]>([]);

  // Profile LASRRA gentle card inputs
  const [profileLasrraInput, setProfileLasrraInput] = useState<string>('');
  const [profileLasrraConsent, setProfileLasrraConsent] = useState<boolean>(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  // Modals & Drawers
  const [isReportWizardOpen, setIsReportWizardOpen] = useState<boolean>(false);
  const [selectedReport, setSelectedReport] = useState<ReportRecord | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Notifications Inbox (NOT-01..05)
  const [notifications, setNotifications] = useState<NotificationMessage[]>([
    {
      id: 'not-1',
      channel: 'SMS',
      refCode: 'FL-4K7Q2',
      agencyName: 'Lagos Roads Maintenance Team (Sample Pilot Agency)',
      text: 'Fix Lagos: Report FL-4K7Q2 acknowledged by Lagos Roads Maintenance Team (Sample). Track: fixlagos.ng/r/FL-4K7Q2',
      createdAt: '2026-11-05T14:20:00Z',
      unread: false,
    },
    {
      id: 'not-2',
      channel: 'SMS',
      refCode: 'FL-8M2P9',
      agencyName: 'Drainage & Flood Control Office (Sample Pilot Agency)',
      text: 'Fix Lagos: Drainage & Flood Control Office (Sample) marked FL-8M2P9 Fixed. Is it fixed? Confirm within 200m: fixlagos.ng/r/FL-8M2P9',
      createdAt: '2026-11-08T16:40:00Z',
      unread: true,
    },
  ]);

  // Immutable Audit Logs (STA-01, LRS-10, RTE-04)
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([
    {
      id: 'aud-1',
      timestamp: '2026-11-08T12:15:00Z',
      actorRole: 'system_router',
      action: 'RTE_03_UNROUTED_QUEUE',
      targetRef: 'FL-5C9J3',
      detail: 'Road ownership unknown; placed in Moderator Triage Queue without dropping.',
    },
    {
      id: 'aud-2',
      timestamp: '2026-11-07T09:10:00Z',
      actorRole: 'agency_officer',
      action: 'STATUS_ACKNOWLEDGED',
      targetRef: 'FL-2N6V4',
      detail: 'Acknowledged by Lagos Roads Maintenance Team (Sample Pilot Agency).',
    },
  ]);

  const { isInstallable, isInstalled, install } = usePWAInstall();

  // Load remembered low-data preference (MAP-05) & IndexedDB drafts (REP-08)
  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      try {
        const savedLowData = window.localStorage.getItem('fix_lagos_low_data');
        if (savedLowData === 'true') {
          setLowDataMode(true);
        }
      } catch {
        // ignore storage errors
      }
      try {
        const drafts = await listOfflineDrafts();
        if (active) setOfflineDrafts(drafts);
      } catch {
        // ignore idb errors
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const toggleLowDataMode = () => {
    const next = !lowDataMode;
    setLowDataMode(next);
    try {
      window.localStorage.setItem('fix_lagos_low_data', String(next));
    } catch {
      // ignore
    }
    showToast(
      next
        ? 'Low-data mode enabled: lighter map, no video autoplay, preference saved (MAP-05).'
        : 'Standard data mode restored.'
    );
  };

  // Filtered & sorted reports for Map & Feed
  const filteredReports = reports
    .filter((r) => (categoryFilter === 'all' ? true : r.categoryId === categoryFilter))
    .filter((r) => (statusFilter === 'all' ? true : r.status === statusFilter))
    .filter((r) => (areaFilter === 'all' ? true : r.areaId === areaFilter))
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return b.createdAt.localeCompare(a.createdAt);
      }
      if (sortBy === 'nearest') {
        const distA = Math.hypot(a.lat - 6.5095, a.lng - 3.3711);
        const distB = Math.hypot(b.lat - 6.5095, b.lng - 3.3711);
        return distA - distB;
      }
      return b.priorityScore - a.priorityScore;
    });

  // Handle report creation (Online API or Offline IndexedDB draft per REP-08)
  const handleCreateReport = async (payload: {
    idempotencyKey: string;
    categoryId: CategoryGroup;
    subCategory: string;
    note: string;
    lat: number;
    lng: number;
    accuracyM: number;
    areaId: string;
    streetLabel: string;
    roadOwner: RoadOwner;
    isDangerous: boolean;
    photos: string[];
    videoAttached: boolean;
  }): Promise<ReportRecord | { offlineSaved: true; idempotencyKey: string }> => {
    if (isOfflineSimulated) {
      const draft: OfflineDraftRecord = {
        ...payload,
        createdAt: new Date().toISOString(),
        status: 'Waiting to send',
        retryCount: 0,
        nextRetryAt: Date.now() + 2000,
      };
      await saveOfflineDraft(draft);
      const updatedDrafts = await listOfflineDrafts();
      setOfflineDrafts(updatedDrafts);
      showToast(
        'Saved as offline draft ("Waiting to send") in IndexedDB. Will auto-upload when online (REP-08).'
      );
      return { offlineSaved: true, idempotencyKey: payload.idempotencyKey };
    }

    const reporterDisplay =
      firstNameOptIn && firstName.trim()
        ? `${firstName.trim()} (First-name opt-in)`
        : 'Anonymous resident';

    const response = await fetch('/api/v1/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': payload.idempotencyKey,
      },
      body: JSON.stringify({
        ...payload,
        reporterDisplay,
        reporterResidentStatus: residentStatus,
        userVerifiedReportCount: 3,
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData?.error?.message || 'Failed to submit report');
    }

    const result = await response.json();
    const created: ReportRecord = result.data;

    setReports((prev) => {
      if (prev.some((r) => r.idempotencyKey === created.idempotencyKey)) {
        return prev;
      }
      return [created, ...prev];
    });

    // Add SMS/in-app notification confirmation (NOT-05)
    setNotifications((prev) => [
      {
        id: `not-${Date.now()}`,
        channel: smsAlertsEnabled ? 'SMS' : 'In-App',
        refCode: created.refCode,
        agencyName: created.agencyName,
        text: `Fix Lagos: Report ${created.refCode} received and routed to ${created.agencyName}. Track: fixlagos.ng/r/${created.refCode}`,
        createdAt: created.createdAt,
        unread: true,
      },
      ...prev,
    ]);

    showToast(`Report ${created.refCode} submitted and routed to ${created.agencyName}.`);
    return created;
  };

  // Sync offline IndexedDB drafts when connection returns (REP-08)
  const handleSyncOfflineDrafts = async () => {
    if (offlineDrafts.length === 0) return;
    setSyncingDrafts(true);
    setIsOfflineSimulated(false);

    try {
      for (const draft of offlineDrafts) {
        await handleCreateReport({
          idempotencyKey: draft.idempotencyKey,
          categoryId: draft.categoryId,
          subCategory: draft.subCategory,
          note: draft.note,
          lat: draft.lat,
          lng: draft.lng,
          accuracyM: draft.accuracyM,
          areaId: draft.areaId,
          streetLabel: draft.streetLabel,
          roadOwner: draft.roadOwner,
          isDangerous: draft.isDangerous,
          photos: draft.photos,
          videoAttached: draft.videoAttached,
        });
        await removeOfflineDraft(draft.idempotencyKey);
      }
      const remaining = await listOfflineDrafts();
      setOfflineDrafts(remaining);
      showToast(
        'All offline drafts uploaded with Idempotency-Key protection — zero duplicates created.'
      );
    } finally {
      setSyncingDrafts(false);
    }
  };

  // CNF-01 "I see this too" confirmation
  const handleConfirmSeeToo = (refCode: string) => {
    if (userConfirmedRefs.includes(refCode)) {
      showToast('You have already confirmed this report (CNF-03: 1 confirmation per user).');
      return;
    }
    setUserConfirmedRefs((prev) => [...prev, refCode]);
    fetch(`/api/v1/reports/${refCode}/confirmations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userPhone || 'usr-citizen-session',
        kind: 'see_too',
        userLat: 6.5095,
        userLng: 3.3711,
      }),
    }).catch(() => undefined);
    setReports((prev) =>
      prev.map((r) => {
        if (r.refCode !== refCode) return r;
        const nextCount = r.confirmationCount + 1;
        const nextScore = calculatePriorityScore({
          severity: r.severity,
          confirmations: nextCount,
          daysOpen: 3,
          isReopened: r.status === 'reopened',
        });
        const updated: ReportRecord = {
          ...r,
          confirmationCount: nextCount,
          priorityScore: nextScore,
        };
        if (selectedReport?.refCode === refCode) {
          setSelectedReport(updated);
        }
        return updated;
      })
    );
    showToast(`Added "I see this too" to ${refCode}. Priority score increased (+2).`);
  };

  // Section 5.3 & CNF-02 Community Fix Verification ("Is it fixed?")
  const handleVerifyFix = (
    refCode: string,
    vote: 'fix_yes' | 'fix_no' | 'fix_unsure'
  ) => {
    const nowIso = new Date().toISOString();
    const targetReport = reports.find((r) => r.refCode === refCode);
    if (targetReport) {
      fetch(`/api/v1/reports/${refCode}/confirmations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: `${userPhone || 'usr-verifier'}-${Date.now()}`,
          kind: vote,
          userLat: targetReport.lat + 0.0001,
          userLng: targetReport.lng + 0.0001,
        }),
      }).catch(() => undefined);
    }
    setReports((prev) =>
      prev.map((r) => {
        if (r.refCode !== refCode) return r;
        const nextYes = vote === 'fix_yes' ? r.fixYesCount + 1 : r.fixYesCount;
        const nextNo = vote === 'fix_no' ? r.fixNoCount + 1 : r.fixNoCount;
        const evaluation = evaluateFixVerificationState({
          fixYesCount: nextYes,
          fixNoCount: nextNo,
          daysSinceFixed: 1,
        });

        const nextPriority = calculatePriorityScore({
          severity: r.severity,
          confirmations: r.confirmationCount,
          daysOpen: 4,
          isReopened: evaluation.nextStatus === 'reopened',
        });

        const noteText =
          vote === 'fix_yes'
            ? `Community verifier within 200 m answered YES (${nextYes}/2 Yes).`
            : vote === 'fix_no'
              ? `Community verifier within 200 m disputed the fix (${nextNo}/2 No).`
              : 'Community verifier marked Not sure.';

        const updated: ReportRecord = {
          ...r,
          fixYesCount: nextYes,
          fixNoCount: nextNo,
          status: evaluation.nextStatus,
          priorityScore: nextPriority,
          verifiedAt: evaluation.nextStatus === 'verified' ? nowIso : r.verifiedAt,
          updatedAt: nowIso,
          timeline: [
            ...r.timeline,
            {
              id: `ev-${Date.now()}`,
              reportId: r.id,
              fromStatus: r.status,
              toStatus: evaluation.nextStatus,
              agencyName: 'Community Verification (within 200 m)',
              note: noteText,
              createdAt: nowIso,
            },
          ],
        };
        if (selectedReport?.refCode === refCode) {
          setSelectedReport(updated);
        }
        return updated;
      })
    );
    showToast(`Recorded your "${vote.replace('fix_', '').toUpperCase()}" verification on ${refCode}.`);
  };

  // AGD-03 Agency Status Update
  const handleAgencyUpdateStatus = (params: {
    refCode: string;
    toStatus: CitizenStatus;
    note: string;
    rejectionReason?: string;
    returnToModerator?: boolean;
    suggestedAgencyId?: string;
    attachRepairPhoto?: boolean;
    assignedTeamLabel?: string;
  }) => {
    const nowIso = new Date().toISOString();
    fetch(`/api/v1/agency/reports/${params.refCode}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }).catch(() => undefined);

    setReports((prev) =>
      prev.map((r) => {
        if (r.refCode !== params.refCode) return r;
        const repairPhoto = params.attachRepairPhoto
          ? buildCivicThumbnailSvg({
              title: `Repair completed · ${r.streetLabel}`,
              category: r.categoryId,
              refCode: r.refCode,
              isRepairPhoto: true,
            })
          : r.repairPhotoUrl;

        const unitPrefix = params.assignedTeamLabel
          ? `[Assigned unit: ${params.assignedTeamLabel}] `
          : '';

        const updated: ReportRecord = {
          ...r,
          status: params.toStatus,
          rejectionReason: params.rejectionReason ?? r.rejectionReason,
          agencyId: params.returnToModerator ? null : r.agencyId,
          agencyName: params.returnToModerator
            ? 'Moderator Triage Queue'
            : r.agencyName,
          repairPhotoUrl: repairPhoto,
          acknowledgedAt:
            params.toStatus === 'acknowledged' && !r.acknowledgedAt
              ? nowIso
              : r.acknowledgedAt,
          fixedAt: params.toStatus === 'fixed' ? nowIso : r.fixedAt,
          isOverdue: false,
          updatedAt: nowIso,
          timeline: [
            ...r.timeline,
            {
              id: `ev-${Date.now()}-${params.refCode}-${Math.random().toString(36).slice(2, 7)}`,
              reportId: r.id,
              fromStatus: r.status,
              toStatus: params.toStatus,
              agencyName: params.returnToModerator
                ? 'Moderator Triage Queue'
                : r.agencyName,
              note: `${unitPrefix}${params.note}`,
              photoUrl: repairPhoto,
              createdAt: nowIso,
            },
          ],
        };
        return updated;
      })
    );

    // Send SMS notification on Acknowledged, Fixed, or Reopened (NOT-01, NOT-05)
    if (
      params.toStatus === 'acknowledged' ||
      params.toStatus === 'fixed' ||
      params.toStatus === 'reopened'
    ) {
      setNotifications((prev) => [
        {
          id: `not-${Date.now()}-${params.refCode}-${Math.random().toString(36).slice(2, 7)}`,
          channel: smsAlertsEnabled ? 'SMS' : 'In-App',
          refCode: params.refCode,
          agencyName: 'Pilot Agency Update',
          text: `Fix Lagos: Report ${params.refCode} is now ${params.toStatus.toUpperCase()}. ${params.note} Track: fixlagos.ng/r/${params.refCode}`,
          createdAt: nowIso,
          unread: true,
        },
        ...prev,
      ]);
    }

    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}-${params.refCode}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: nowIso,
        actorRole: 'agency_officer',
        action: params.returnToModerator
          ? 'RTE_05_NOT_OUR_RESPONSIBILITY'
          : `STATUS_${params.toStatus.toUpperCase()}`,
        targetRef: params.refCode,
        detail: params.note,
      },
      ...prev,
    ]);

    showToast(`Updated ${params.refCode} to "${params.toStatus}".`);
  };

  // RTE-04 Moderator Reassignment
  const handleModeratorReassign = (refCode: string, agencyId: string) => {
    const agency = SAMPLE_AGENCIES.find((a) => a.id === agencyId);
    if (!agency) return;
    const nowIso = new Date().toISOString();

    setReports((prev) =>
      prev.map((r) =>
        r.refCode === refCode
          ? {
              ...r,
              agencyId: agency.id,
              agencyName: agency.name,
              updatedAt: nowIso,
              timeline: [
                ...r.timeline,
                {
                  id: `ev-${Date.now()}`,
                  reportId: r.id,
                  fromStatus: r.status,
                  toStatus: r.status,
                  agencyName: agency.name,
                  note: `Moderator routed report to ${agency.name} (RTE-04).`,
                  createdAt: nowIso,
                },
              ],
            }
          : r
      )
    );

    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        timestamp: nowIso,
        actorRole: 'moderator',
        action: 'RTE_04_MODERATOR_REASSIGN',
        targetRef: refCode,
        detail: `Assigned unrouted report to ${agency.name}`,
      },
      ...prev,
    ]);
    showToast(`Routed ${refCode} to ${agency.name} and logged reassignment.`);
  };

  // MOD-02 Flag report
  const handleFlagReport = (refCode: string, reason: FlagReason) => {
    fetch(`/api/v1/reports/${refCode}/flags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reporterUserId: userPhone || 'usr-citizen-session',
        reason,
      }),
    }).catch(() => undefined);

    setReports((prev) =>
      prev.map((r) =>
        r.refCode === refCode
          ? {
              ...r,
              isFlagged: true,
              flagReasons: [...r.flagReasons, reason],
            }
          : r
      )
    );
    showToast(`Flagged ${refCode} (${reason}) for moderator review.`);
  };

  // MOD-03 Merge Duplicates (oldest becomes parent, confirmations move across)
  const handleMergeDuplicate = (childRef: string, parentRef: string) => {
    fetch('/api/v1/admin/routing-rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionType: 'MERGE_DUPLICATES',
        firstRef: childRef,
        secondRef: parentRef,
      }),
    }).catch(() => undefined);

    const child = reports.find((r) => r.refCode === childRef);
    if (!child) return;

    setReports((prev) =>
      prev
        .filter((r) => r.refCode !== childRef)
        .map((r) =>
          r.refCode === parentRef
            ? {
                ...r,
                confirmationCount: r.confirmationCount + child.confirmationCount,
                priorityScore: calculatePriorityScore({
                  severity: r.severity,
                  confirmations: r.confirmationCount + child.confirmationCount,
                  daysOpen: 4,
                }),
              }
            : r
        )
    );

    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorRole: 'moderator',
        action: 'MOD_03_MERGE_DUPLICATE',
        targetRef: parentRef,
        detail: `Merged duplicate ${childRef} into oldest parent ${parentRef} and moved ${child.confirmationCount} confirmations across.`,
      },
      ...prev,
    ]);
    showToast(`Merged ${childRef} into ${parentRef} and transferred confirmations.`);
  };

  // ACC-04 & LRS-12 Account Deletion (anonymise personal data, keep infrastructure record)
  const handleDeleteAccount = () => {
    setIsSignedIn(false);
    setUserPhone('');
    setFirstName('');
    setFirstNameOptIn(false);
    setResidentStatus('none');
    setProfileLasrraInput('');
    setProfileLasrraConsent(false);
    setReports((prev) =>
      prev.map((r) => ({
        ...r,
        reporterDisplay: 'Anonymous resident',
        reporterResidentStatus: 'none',
      }))
    );
    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorRole: 'citizen_self_service',
        action: 'ACC_04_ACCOUNT_DELETED_NDPA',
        targetRef: 'USER-SELF',
        detail:
          'Erased encrypted phone, display name, LASRRA ID cipher/hash and card photo. Retained anonymised infrastructure reports.',
      },
      ...prev,
    ]);
    setProfileNotice(
      'Your account personal data (encrypted phone number, name, and LASRRA record) has been erased under the Nigeria Data Protection Act 2023. Public infrastructure records remain anonymised.'
    );
  };

  const unreadAlertsCount = notifications.filter((n) => n.unread).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F5EF] text-[#14211E] pb-24 md:pb-8">
      {/* TOP BAR CONTRACT (3 zones: Brand Wordmark | Single-Line Navigation | 1 Primary Action) */}
      <header className="sticky top-0 z-30 bg-[#FFFFFF] border-b border-[#DDE3DF] px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Title */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('map_feed');
          }}
          className="text-xl font-bold font-heading tracking-tight text-[#14211E] whitespace-nowrap shrink-0"
        >
          Fix Lagos
        </a>

        {/* Zone 2: Clean Single-Line Text Navigation Links */}
        <nav
          aria-label="Primary workspace navigation"
          className="hidden md:flex items-center gap-6 text-sm font-semibold text-[#5B6B66]"
        >
          <button
            type="button"
            onClick={() => setActiveTab('map_feed')}
            className={`min-h-[48px] px-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
              activeTab === 'map_feed'
                ? 'border-[#1F6F57] text-[#14211E]'
                : 'border-transparent hover:text-[#14211E]'
            }`}
          >
            Map & Feed
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('my_reports')}
            className={`min-h-[48px] px-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
              activeTab === 'my_reports'
                ? 'border-[#1F6F57] text-[#14211E]'
                : 'border-transparent hover:text-[#14211E]'
            }`}
          >
            My Reports ({offlineDrafts.length > 0 ? `${offlineDrafts.length} draft` : reports.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('agency')}
            className={`min-h-[48px] px-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
              activeTab === 'agency'
                ? 'border-[#1F6F57] text-[#14211E]'
                : 'border-transparent hover:text-[#14211E]'
            }`}
          >
            Agency Queue
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('moderator')}
            className={`min-h-[48px] px-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
              activeTab === 'moderator'
                ? 'border-[#1F6F57] text-[#14211E]'
                : 'border-transparent hover:text-[#14211E]'
            }`}
          >
            Moderator
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transparency')}
            className={`min-h-[48px] px-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
              activeTab === 'transparency'
                ? 'border-[#1F6F57] text-[#14211E]'
                : 'border-transparent hover:text-[#14211E]'
            }`}
          >
            Transparency
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action CTA */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            data-testid="top-report-button"
            onClick={() => setIsReportWizardOpen(true)}
            className="min-h-[48px] px-4 py-2.5 rounded-[12px] bg-[#F2B21A] text-[#14211E] font-semibold text-sm flex items-center gap-2 whitespace-nowrap shrink-0 hover:brightness-95"
          >
            <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Report issue</span>
          </button>
        </div>
      </header>

      {/* Toast Confirmation Banner (PRD 10.5: toasts only for confirmations; errors stay inline) */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mx-auto max-w-[1440px] w-full px-4 sm:px-6 pt-3"
        >
          <div className="p-3 rounded-[12px] bg-[#14211E] text-[#F7F5EF] text-xs font-semibold flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#F2B21A] shrink-0" aria-hidden="true" />
              <span>{toastMessage}</span>
            </span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-xs underline whitespace-nowrap"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Workspace Container (capped at 1440px per PRD 10.6) */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-3 sm:px-6 pt-3 space-y-3 sm:space-y-4">
        {/* Compact Civic Context & Low-Data / Offline Controls Bar */}
        <section
          aria-label="Lagos connectivity, low-data, and role controls"
          className="bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] p-2.5 sm:p-3.5 flex flex-wrap items-center justify-between gap-2"
        >
          <div className="hidden sm:block space-y-0.5">
            <p className="text-sm font-bold text-[#14211E] font-heading">
              Report it. Route it. Track it until it’s fixed.
            </p>
            <p className="text-xs text-[#5B6B66]">
              Pilot areas: Yaba LCDA & Surulere LGA (Sample Data) · Emergency? Call{' '}
              <strong className="text-[#B3261E]">112</strong>
            </p>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
            {/* Low-Data Mode Toggle (MAP-05) */}
            <button
              type="button"
              onClick={toggleLowDataMode}
              aria-pressed={lowDataMode}
              className={`min-h-[48px] px-3 py-1.5 rounded-[12px] border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                lowDataMode
                  ? 'bg-[#1F6F57] text-[#FFFFFF] border-[#1F6F57]'
                  : 'bg-[#F7F5EF] text-[#14211E] border-[#DDE3DF]'
              }`}
            >
              <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{lowDataMode ? 'Low-data: ON' : 'Low-data mode'}</span>
            </button>

            {/* Offline Simulation Toggle (REP-08) */}
            <button
              type="button"
              onClick={() => {
                const next = !isOfflineSimulated;
                setIsOfflineSimulated(next);
                showToast(
                  next
                    ? 'Offline mode active: new reports save to IndexedDB as "Waiting to send".'
                    : 'Back online! Ready to sync offline drafts.'
                );
              }}
              aria-pressed={isOfflineSimulated}
              className={`min-h-[48px] px-3 py-1.5 rounded-[12px] border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                isOfflineSimulated
                  ? 'bg-[#FEF3E2] text-[#9A5A00] border-[#F3D098]'
                  : 'bg-[#F7F5EF] text-[#14211E] border-[#DDE3DF]'
              }`}
            >
              {isOfflineSimulated ? (
                <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <Wifi className="w-4 h-4 text-[#1F6F57] shrink-0" aria-hidden="true" />
              )}
              <span>{isOfflineSimulated ? 'Offline (Test Drafts)' : 'Online (3G Ready)'}</span>
            </button>

            {/* Sync Offline Drafts Button if drafts exist */}
            {offlineDrafts.length > 0 && (
              <button
                type="button"
                disabled={syncingDrafts}
                onClick={handleSyncOfflineDrafts}
                className="min-h-[48px] px-3.5 py-1.5 rounded-[12px] bg-[#F2B21A] text-[#14211E] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  {syncingDrafts
                    ? 'Uploading drafts...'
                    : `Sync ${offlineDrafts.length} draft(s)`}
                </span>
              </button>
            )}

            {/* In-App PWA Install Button */}
            {!isInstalled && (
              <button
                type="button"
                onClick={() => {
                  if (isInstallable) {
                    install();
                  } else {
                    showToast(
                      'Fix Lagos PWA manifest & service worker ready. Use browser "Add to Home Screen" on Android/iOS.'
                    );
                  }
                }}
                className="min-h-[48px] px-3 py-1.5 rounded-[12px] border-2 border-[#1F6F57] text-[#1F6F57] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Install PWA</span>
              </button>
            )}
          </div>
        </section>

        {/* VIEW 1: CITIZEN MAP & FEED SPLIT (MAP-01..05) */}
        {activeTab === 'map_feed' && (
          <div className="space-y-3 sm:space-y-4">
            {/* Filter & Sort Controls Bar (MAP-02) */}
            <div className="bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] p-2.5 sm:p-3.5 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 overflow-x-auto w-full lg:w-auto pb-0.5">
                {(
                  [
                    { id: 'all', label: 'All faults' },
                    { id: 'roads', label: 'Roads' },
                    { id: 'street_lights', label: 'Street lights' },
                    { id: 'drainage', label: 'Drainage & flooding' },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`min-h-[48px] px-3.5 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      categoryFilter === cat.id
                        ? 'bg-[#1F6F57] text-[#FFFFFF] border-[#1F6F57]'
                        : 'bg-[#F7F5EF] text-[#14211E] border-[#DDE3DF] hover:bg-[#DDE3DF]/50'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="hidden sm:flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter reports by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="min-h-[48px] px-3 rounded-[12px] border border-[#DDE3DF] bg-[#F7F5EF] text-xs font-semibold text-[#14211E]"
                >
                  <option value="all">All statuses</option>
                  <option value="reported">Reported</option>
                  <option value="acknowledged">Acknowledged</option>
                  <option value="in_progress">In progress</option>
                  <option value="fixed">Fixed (Verify now)</option>
                  <option value="verified">Verified</option>
                </select>

                <select
                  aria-label="Filter reports by pilot area"
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value)}
                  className="min-h-[48px] px-3 rounded-[12px] border border-[#DDE3DF] bg-[#F7F5EF] text-xs font-semibold text-[#14211E]"
                >
                  <option value="all">All pilot areas</option>
                  {SAMPLE_PILOT_AREAS.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Sort reports"
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(e.target.value as 'nearest' | 'newest' | 'priority')
                  }
                  className="min-h-[48px] px-3 rounded-[12px] border border-[#DDE3DF] bg-[#F7F5EF] text-xs font-semibold text-[#14211E]"
                >
                  <option value="priority">Sort: Highest priority</option>
                  <option value="nearest">Sort: Nearest to me</option>
                  <option value="newest">Sort: Newest first</option>
                </select>
              </div>
            </div>

            {/* Laptop/Desktop 40/60 Split (PRD 10.6): Map (5 cols) + Report Feed List (7 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {mobileSubView === 'split' && (
                <div className="lg:col-span-5 lg:sticky lg:top-20">
                  <LagosVectorMap
                    reports={filteredReports}
                    selectedReportRef={selectedReport?.refCode ?? null}
                    onSelectReport={(rep) => setSelectedReport(rep)}
                    nearMeRadiusKm={nearMeRadiusKm}
                    onToggleNearMeRadius={() =>
                      setNearMeRadiusKm(nearMeRadiusKm === 2 ? 15 : 2)
                    }
                    lowDataMode={lowDataMode}
                    onFallbackToList={() => setMobileSubView('list_only')}
                  />
                </div>
              )}

              <div
                className={
                  mobileSubView === 'list_only' ? 'lg:col-span-12' : 'lg:col-span-7'
                }
              >
                {mobileSubView === 'list_only' && (
                  <div className="mb-3 flex items-center justify-between bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] p-3">
                    <span className="text-xs font-semibold text-[#14211E]">
                      Showing text-only list fallback (MAP-04)
                    </span>
                    <button
                      type="button"
                      onClick={() => setMobileSubView('split')}
                      className="min-h-[44px] px-3 py-1.5 rounded-[12px] border border-[#1F6F57] text-[#1F6F57] text-xs font-semibold"
                    >
                      Show Map + List
                    </button>
                  </div>
                )}

                {filteredReports.length === 0 ? (
                  /* PRD 10.5 Empty State: one friendly line and one next action */
                  <div className="bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] p-8 text-center space-y-3">
                    <p className="text-base font-bold text-[#14211E]">
                      No reports near you yet. Be the first.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryFilter('all');
                        setStatusFilter('all');
                        setAreaFilter('all');
                        setIsReportWizardOpen(true);
                      }}
                      className="min-h-[52px] px-5 py-3 rounded-[12px] bg-[#F2B21A] text-[#14211E] font-semibold text-sm inline-flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" aria-hidden="true" />
                      <span>Report an issue now</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3" data-testid="report-feed-list">
                    {filteredReports.map((report) => {
                      const alreadyConfirmed = userConfirmedRefs.includes(
                        report.refCode
                      );
                      return (
                        <article
                          key={report.id}
                          className="bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] p-3.5 sm:p-4 flex flex-col sm:flex-row gap-4 hover:border-[#1F6F57] transition-colors"
                        >
                          {/* PRD 10.5 Report Card: 4:3 thumbnail with blurred placeholder */}
                          <button
                            type="button"
                            onClick={() => setSelectedReport(report)}
                            aria-label={`Inspect report ${report.refCode}`}
                            className="w-full sm:w-44 aspect-[4/3] rounded-[12px] border border-[#DDE3DF] overflow-hidden bg-[#14211E] shrink-0 relative group"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={report.photos[0]}
                              alt={`${report.subCategory} at ${report.streetLabel}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-[#14211E]/85 text-[#F7F5EF] font-heading font-bold text-xs tabular-nums">
                              {report.refCode}
                            </span>
                          </button>

                          {/* Card Body */}
                          <div className="flex-1 flex flex-col justify-between space-y-2.5">
                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <StatusBadge status={report.status} />
                                  <ResidentStatusBadge
                                    status={report.reporterResidentStatus}
                                  />
                                  {report.isDangerous && (
                                    <span className="text-xs font-bold text-[#B3261E] flex items-center gap-1">
                                      <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                                      <span>Dangerous</span>
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-[#5B6B66] tabular-nums">
                                  {formatWatDate(report.createdAt)}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => setSelectedReport(report)}
                                className="text-left block mt-1.5"
                              >
                                <h2 className="text-base font-bold text-[#14211E] font-heading flex items-center gap-1.5 hover:text-[#1F6F57]">
                                  <CategoryIcon
                                    category={report.categoryId}
                                    className="w-4 h-4 text-[#1F6F57] shrink-0"
                                  />
                                  <span>
                                    {report.subCategory} — {report.streetLabel}
                                  </span>
                                </h2>
                              </button>

                              <p className="text-xs text-[#5B6B66] mt-1 line-clamp-2">
                                {report.note}
                              </p>
                            </div>

                            {/* Unboxed Metadata & Action Row */}
                            <div className="pt-2 border-t border-[#DDE3DF] flex flex-wrap items-center justify-between gap-2 text-xs text-[#5B6B66]">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-[#14211E]">
                                  {report.agencyName}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="tabular-nums font-semibold">
                                  {report.confirmationCount} confirmations
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="tabular-nums">
                                  Priority {report.priorityScore.toFixed(1)}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                {report.status === 'fixed' ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedReport(report)}
                                    className="min-h-[48px] px-3.5 py-2 rounded-[12px] bg-[#F2B21A] text-[#14211E] font-semibold text-xs whitespace-nowrap"
                                  >
                                    Is it fixed? Verify
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={alreadyConfirmed}
                                    onClick={() => handleConfirmSeeToo(report.refCode)}
                                    className={`min-h-[48px] px-3 py-2 rounded-[12px] font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap ${
                                      alreadyConfirmed
                                        ? 'bg-[#E6F3EE] text-[#1F6F57] border border-[#1F6F57]'
                                        : 'border-2 border-[#1F6F57] text-[#1F6F57] hover:bg-[#E6F3EE]'
                                    }`}
                                  >
                                    <ThumbsUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                    <span>
                                      {alreadyConfirmed ? 'Confirmed ✓' : 'I see this too'}
                                    </span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setSelectedReport(report)}
                                  className="min-h-[48px] px-3 py-2 rounded-[12px] border border-[#DDE3DF] text-[#14211E] font-semibold text-xs whitespace-nowrap"
                                >
                                  Details
                                </button>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: MY REPORTS & OFFLINE DRAFTS (Section 5.2 & REP-08) */}
        {activeTab === 'my_reports' && (
          <div className="space-y-5" data-testid="my-reports-view">
            <div className="bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-[#14211E] font-heading">
                  My Reports & Offline Drafts
                </h1>
                <p className="text-sm text-[#5B6B66]">
                  Track every report’s public status trail, responsible agency, and offline drafts stored in IndexedDB (REP-08).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="min-h-[48px] px-4 py-2.5 rounded-[12px] border-2 border-[#1F6F57] text-[#1F6F57] font-semibold text-sm flex items-center gap-2"
                >
                  <User className="w-4 h-4" aria-hidden="true" />
                  <span>Profile &amp; optional LASRRA ID</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsReportWizardOpen(true)}
                  className="min-h-[48px] px-4 py-2.5 rounded-[12px] bg-[#F2B21A] text-[#14211E] font-semibold text-sm flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  <span>New report</span>
                </button>
              </div>
            </div>

            {/* Offline Drafts Queue ("Waiting to send") */}
            <div className="bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-[#14211E] font-heading">
                  Offline Drafts in IndexedDB ({offlineDrafts.length})
                </h2>
                {offlineDrafts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSyncOfflineDrafts}
                    className="min-h-[48px] px-4 py-2 rounded-[12px] bg-[#1F6F57] text-[#FFFFFF] text-xs font-semibold flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-4 h-4" aria-hidden="true" />
                    <span>Upload all now</span>
                  </button>
                )}
              </div>

              {offlineDrafts.length === 0 ? (
                <p className="text-xs text-[#5B6B66]">
                  No offline drafts waiting. If your network drops while reporting, your draft is saved here as <strong>“Waiting to send”</strong> and never lost.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {offlineDrafts.map((draft) => (
                    <div
                      key={draft.idempotencyKey}
                      className="p-3.5 rounded-[12px] bg-[#FEF3E2] border border-[#F3D098] flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <span className="text-xs font-bold text-[#9A5A00]">
                          {draft.status} · Idempotency Key: {draft.idempotencyKey}
                        </span>
                        <p className="text-sm font-bold text-[#14211E] mt-0.5">
                          {draft.subCategory} — {draft.streetLabel}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleSyncOfflineDrafts}
                        className="min-h-[48px] px-3.5 py-2 rounded-[12px] bg-[#F2B21A] text-[#14211E] text-xs font-semibold"
                      >
                        Retry upload now
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Published Reports List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reports.map((rep) => (
                <div
                  key={rep.id}
                  className="bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] p-4 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-lg font-bold font-heading tabular-nums text-[#14211E]">
                        {rep.refCode}
                      </span>
                      <p className="text-sm font-bold text-[#14211E] mt-0.5">
                        {rep.subCategory} · {rep.streetLabel}
                      </p>
                      <p className="text-xs text-[#5B6B66] mt-0.5">
                        Agency: <strong>{rep.agencyName}</strong>
                      </p>
                    </div>
                    <StatusBadge status={rep.status} />
                  </div>
                  <div className="pt-2 border-t border-[#DDE3DF] flex items-center justify-between text-xs text-[#5B6B66]">
                    <span>Updated {formatWatDate(rep.updatedAt)}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedReport(rep)}
                      className="min-h-[44px] px-3 py-1.5 rounded-[12px] border border-[#1F6F57] text-[#1F6F57] font-semibold"
                    >
                      Open timeline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 3: ALERTS & SMS INBOX (NOT-01..05) */}
        {activeTab === 'alerts' && (
          <div className="space-y-5" data-testid="alerts-inbox-view">
            <div className="bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[#14211E] font-heading">
                  SMS & In-App Alerts Inbox (NOT-01..05)
                </h1>
                <p className="text-sm text-[#5B6B66]">
                  SMS is the default channel for Acknowledged, Fixed, and Reopened updates because many Lagos residents have no mobile data (NOT-01).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-[#14211E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smsAlertsEnabled}
                    onChange={(e) => setSmsAlertsEnabled(e.target.checked)}
                    className="w-5 h-5 accent-[#1F6F57]"
                  />
                  <span>SMS alerts enabled</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-[#14211E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quietHoursEnabled}
                    onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                    className="w-5 h-5 accent-[#1F6F57]"
                  />
                  <span>Quiet hours 9pm–7am (NOT-04)</span>
                </label>
              </div>
            </div>

            <div className="space-y-3">
              {notifications.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-[#1F6F57] uppercase">
                        {item.channel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-heading font-bold tabular-nums text-[#14211E]">
                        {item.refCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#5B6B66] tabular-nums">
                        {formatWatDate(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-[#14211E] font-mono bg-[#F7F5EF] p-2.5 rounded-[12px] border border-[#DDE3DF]">
                      {item.text}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const target = reports.find((r) => r.refCode === item.refCode);
                      if (target) setSelectedReport(target);
                    }}
                    className="min-h-[48px] px-3.5 py-2 rounded-[12px] border-2 border-[#1F6F57] text-[#1F6F57] text-xs font-semibold"
                  >
                    Inspect {item.refCode}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 4: PROFILE, OPTIONAL LASRRA ID & NDPA 2023 PRIVACY CENTER (ACC-01..05, LRS-01..13) */}
        {activeTab === 'profile' && (
          <div className="space-y-5 max-w-3xl" data-testid="profile-privacy-view">
            <div className="bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-bold text-[#14211E] font-heading">
                    Citizen Profile & Privacy Controls
                  </h1>
                  <p className="text-sm text-[#5B6B66]">
                    Protected under the Nigeria Data Protection Act 2023 (Section 12). Public display is anonymous by default (ACC-05).
                  </p>
                </div>
                <ResidentStatusBadge status={residentStatus} />
              </div>

              {profileNotice && (
                <div
                  role="status"
                  className="p-3.5 rounded-[12px] bg-[#E6F3EE] border border-[#1F6F57] text-xs font-semibold text-[#1F6F57]"
                >
                  {profileNotice}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label
                    htmlFor="profile-first-name"
                    className="block text-sm font-semibold text-[#14211E] mb-1"
                  >
                    First name (shown only if you opt in below)
                  </label>
                  <input
                    id="profile-first-name"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full min-h-[52px] px-3.5 rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF] text-[16px]"
                  />
                </div>
                <div className="flex items-end">
                  <label className="min-h-[52px] w-full px-3.5 rounded-[12px] border border-[#DDE3DF] bg-[#F7F5EF] flex items-center gap-2.5 text-sm font-semibold text-[#14211E] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={firstNameOptIn}
                      onChange={(e) => setFirstNameOptIn(e.target.checked)}
                      className="w-5 h-5 accent-[#1F6F57]"
                    />
                    <span>Opt in to show first name on reports (ACC-05)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* LRS-01..LRS-13 Gentle Optional LASRRA Card in Profile */}
            <div className="bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#1D5FA8]" aria-hidden="true" />
                  <h2 className="text-lg font-bold text-[#14211E] font-heading">
                    Add your LASRRA ID (optional — LRS-01)
                  </h2>
                </div>
                <ResidentStatusBadge status={residentStatus} />
              </div>

              <p className="text-sm text-[#14211E] font-medium">
                Reports from registered residents carry more weight with agencies.
              </p>
              <p className="text-xs text-[#5B6B66]">
                Equal treatment guarantee (LRS-07): Reports with or without a LASRRA ID are routed, displayed, and updated identically. Your ID number is encrypted at rest and never shown publicly or to agencies.
              </p>

              <div className="space-y-3 pt-1">
                <div>
                  <label
                    htmlFor="profile-lasrra-input"
                    className="block text-sm font-semibold text-[#14211E] mb-1"
                  >
                    LASRRA Registration Number (optional)
                  </label>
                  <input
                    id="profile-lasrra-input"
                    type="text"
                    value={profileLasrraInput}
                    onChange={(e) => setProfileLasrraInput(e.target.value)}
                    placeholder="e.g. LASRRA-9042188"
                    className="w-full min-h-[52px] px-3.5 rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF] text-[16px]"
                  />
                </div>

                <label className="flex items-start gap-2.5 text-xs text-[#5B6B66] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profileLasrraConsent}
                    onChange={(e) => setProfileLasrraConsent(e.target.checked)}
                    className="mt-0.5 w-5 h-5 accent-[#1F6F57]"
                  />
                  <span>
                    <strong>NDPA 2023 Consent (LRS-13):</strong> I consent to Fix Lagos encrypting my LASRRA ID at rest and storing a salted SHA-256 hash to prevent duplicate account use. Only authorised moderators can view it; any card photo is deleted immediately once review finishes (LRS-12).
                  </span>
                </label>

                <button
                  type="button"
                  onClick={async () => {
                    if (profileLasrraInput.trim().length < 6 || !profileLasrraConsent) {
                      setProfileNotice(
                        'Enter at least 6 characters and tick the NDPA 2023 consent box to save your optional LASRRA ID.'
                      );
                      return;
                    }
                    try {
                      const res = await fetch('/api/v1/me/lasrra', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          userId: userPhone || 'usr-citizen-default',
                          rawIdNumber: profileLasrraInput.trim(),
                          cardPhotoPresent: true,
                          consentAccepted: profileLasrraConsent,
                        }),
                      });
                      const payload = (await res.json()) as {
                        error?: { message?: string };
                      };
                      if (!res.ok) {
                        setProfileNotice(
                          payload.error?.message || 'Could not save LASRRA record.'
                        );
                        return;
                      }
                    } catch {
                      // Local state fallback
                    }
                    setResidentStatus('provided');
                    setProfileNotice(
                      'LASRRA ID encrypted at rest. Your reports now show the "ID provided" status badge (#1D5FA8). Per MVP rule LRS-04, nothing is marked "Verified resident" until official state lookup in Phase 2.'
                    );
                  }}
                  className="min-h-[52px] px-5 rounded-[12px] bg-[#F2B21A] text-[#14211E] font-semibold text-sm"
                >
                  Save optional LASRRA ID
                </button>
              </div>
            </div>

            {/* ACC-04 & LRS-12 Account Deletion */}
            <div className="bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#B3261E] font-heading">
                  Delete Account & Erase Personal Data (ACC-04, Section 12)
                </h2>
                <p className="text-xs text-[#5B6B66] mt-0.5">
                  Immediately erases your encrypted phone number, display name, and LASRRA verification record while keeping anonymised public infrastructure repair records.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="min-h-[48px] px-4 py-2.5 rounded-[12px] bg-[#B3261E] text-[#FFFFFF] font-semibold text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>Delete account & erase PII</span>
              </button>
            </div>
          </div>
        )}

        {/* VIEW 5: AGENCY DASHBOARD (AGD-01..05) */}
        {activeTab === 'agency' && (
          <AgencyDashboardView
            reports={reports}
            auditLogs={auditLogs}
            onAgencyUpdateStatus={handleAgencyUpdateStatus}
            onBulkSupervisorUpdate={(params) => {
              for (const refCode of params.refCodes) {
                handleAgencyUpdateStatus({
                  refCode,
                  toStatus: params.toStatus,
                  note: params.note,
                });
              }
              showToast(
                `Supervisor bulk action applied to ${params.refCodes.length} report(s) (AGD-05).`
              );
            }}
            onSelectReport={(rep) => setSelectedReport(rep)}
          />
        )}

        {/* VIEW 6: MODERATOR & ADMIN CONSOLE (MOD-01..05, RTE-02..04, LRS-04..12) */}
        {activeTab === 'moderator' && (
          <ModeratorConsoleView
            reports={reports}
            auditLogs={auditLogs}
            onReassignAgency={handleModeratorReassign}
            onPublishPendingReport={(refCode) => {
              setReports((prev) =>
                prev.map((r) =>
                  r.refCode === refCode ? { ...r, status: 'reported', isFlagged: false } : r
                )
              );
              showToast(`Approved and published ${refCode}.`);
            }}
            onMergeDuplicate={handleMergeDuplicate}
            onLogLasrraAuditAndDeletePhoto={(verId) => {
              fetch('/api/v1/me/lasrra', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: userPhone || 'usr-citizen-default',
                  moderatorId: 'mod-lagos-01',
                  moderatorRole: 'moderator',
                  plausible: true,
                }),
              }).catch(() => undefined);
              setAuditLogs((prev) => [
                {
                  id: `aud-${Date.now()}`,
                  timestamp: new Date().toISOString(),
                  actorRole: 'verification_moderator',
                  action: 'LRS_10_12_VIEW_AND_PURGE_CARD',
                  targetRef: verId,
                  detail:
                    'Moderator completed plausibility check; deleted private card photo and kept status as ID provided (LRS-04, LRS-12).',
                },
                ...prev,
              ]);
              showToast(
                'Audit log written (LRS-10) and private card photo purged (LRS-12). Status stays "ID provided".'
              );
            }}
          />
        )}

        {/* VIEW 7: PUBLIC TRANSPARENCY PAGE (TRN-01..02) */}
        {activeTab === 'transparency' && (
          <PublicTransparencyView
            reports={reports}
            onSelectReport={(rep) => setSelectedReport(rep)}
          />
        )}
      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR WITH RAISED 64px AMBER REPORT BUTTON (PRD 10.5 & 10.6) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF] border-t border-[#DDE3DF] px-2 h-16 grid grid-cols-5 items-center"
      >
        <button
          type="button"
          onClick={() => setActiveTab('map_feed')}
          className={`min-h-[48px] flex flex-col items-center justify-center text-xs font-semibold ${
            activeTab === 'map_feed' ? 'text-[#1F6F57]' : 'text-[#5B6B66]'
          }`}
        >
          <MapPin className="w-5 h-5" aria-hidden="true" />
          <span className="mt-0.5">Map</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('my_reports')}
          className={`min-h-[48px] flex flex-col items-center justify-center text-xs font-semibold ${
            activeTab === 'my_reports' ? 'text-[#1F6F57]' : 'text-[#5B6B66]'
          }`}
        >
          <FileText className="w-5 h-5" aria-hidden="true" />
          <span className="mt-0.5">Reports</span>
        </button>

        {/* PRD 10.5 Report Button: raised centre item, 64px amber rounded square (20px radius) with camera icon and label "Report" */}
        <div className="flex items-center justify-center -mt-6">
          <button
            type="button"
            data-testid="mobile-raised-report-button"
            onClick={() => setIsReportWizardOpen(true)}
            aria-label="Report an infrastructure fault"
            className="w-[64px] h-[64px] rounded-[20px] bg-[#F2B21A] text-[#14211E] border-2 border-[#FFFFFF] shadow-md flex flex-col items-center justify-center font-bold text-xs"
          >
            <Camera className="w-6 h-6" aria-hidden="true" />
            <span className="leading-none mt-1">Report</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('alerts')}
          className={`relative min-h-[48px] flex flex-col items-center justify-center text-xs font-semibold ${
            activeTab === 'alerts' ? 'text-[#1F6F57]' : 'text-[#5B6B66]'
          }`}
        >
          <Bell className="w-5 h-5" aria-hidden="true" />
          <span className="mt-0.5">
            Alerts{unreadAlertsCount > 0 ? ` (${unreadAlertsCount})` : ''}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`min-h-[48px] flex flex-col items-center justify-center text-xs font-semibold ${
            activeTab === 'profile' ? 'text-[#1F6F57]' : 'text-[#5B6B66]'
          }`}
        >
          <User className="w-5 h-5" aria-hidden="true" />
          <span className="mt-0.5">Profile</span>
        </button>
      </nav>

      {/* 4-Step <60s Camera-First Report Wizard Modal */}
      <ReportWizardModal
        isOpen={isReportWizardOpen}
        onClose={() => setIsReportWizardOpen(false)}
        existingReports={reports}
        isSignedIn={isSignedIn}
        userPhone={userPhone}
        userResidentStatus={residentStatus}
        hasSeenLasrraPrompt={hasSeenLasrraPrompt}
        isOfflineSimulated={isOfflineSimulated}
        onCompleteSignIn={(phone) => {
          setIsSignedIn(true);
          setUserPhone(phone);
        }}
        onCompleteLasrraChoice={(status) => {
          setHasSeenLasrraPrompt(true);
          if (status !== 'none') {
            setResidentStatus(status);
          }
        }}
        onConfirmExistingDuplicate={(refCode) => {
          handleConfirmSeeToo(refCode);
        }}
        onSubmitReport={handleCreateReport}
      />

      {/* Report Detail & Fix Verification Drawer */}
      <ReportDetailDrawer
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        userConfirmedIds={userConfirmedRefs}
        onConfirmSeeToo={handleConfirmSeeToo}
        onVerifyFix={handleVerifyFix}
        onFlagReport={handleFlagReport}
      />
    </div>
  );
}

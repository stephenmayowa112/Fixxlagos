'use client';

import React, { useState } from 'react';
import {
  X,
  ThumbsUp,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Flag,
  MapPin,
  ShieldAlert,
  Clock,
} from 'lucide-react';
import type { FlagReason, ReportRecord } from '../packages/api-client/src/index';
import { formatWatDate } from '../lib/domain';
import {
  StatusBadge,
  ResidentStatusBadge,
  CategoryIcon,
  getCategoryLabel,
} from './status-badges';

interface ReportDetailDrawerProps {
  report: ReportRecord | null;
  onClose: () => void;
  userConfirmedIds: string[];
  onConfirmSeeToo: (refCode: string) => void;
  onVerifyFix: (
    refCode: string,
    vote: 'fix_yes' | 'fix_no' | 'fix_unsure'
  ) => void;
  onFlagReport: (refCode: string, reason: FlagReason) => void;
}

export function ReportDetailDrawer({
  report,
  onClose,
  userConfirmedIds,
  onConfirmSeeToo,
  onVerifyFix,
  onFlagReport,
}: ReportDetailDrawerProps) {
  const [showFlagMenu, setShowFlagMenu] = useState(false);

  if (!report) return null;

  const alreadyConfirmed = userConfirmedIds.includes(report.refCode);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-drawer-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#14211E]/60 p-0 sm:p-4 overflow-y-auto"
    >
      <div className="w-full max-w-2xl bg-[#FFFFFF] border border-[#DDE3DF] rounded-t-[16px] sm:rounded-[12px] p-4 sm:p-6 max-h-[92vh] overflow-y-auto space-y-4">
        {/* Top bar */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#DDE3DF]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                id="detail-drawer-title"
                className="text-2xl font-bold font-heading tabular-nums text-[#14211E]"
              >
                {report.refCode}
              </span>
              <StatusBadge status={report.status} />
              <ResidentStatusBadge status={report.reporterResidentStatus} />
            </div>
            <p className="text-base font-bold text-[#14211E] mt-1">
              {getCategoryLabel(report.categoryId)} · {report.subCategory}
            </p>
            <p className="text-xs text-[#5B6B66] flex items-center gap-1 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-[#1F6F57] shrink-0" aria-hidden="true" />
              <span>
                {report.streetLabel} · {report.areaName}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report details"
            className="min-w-[48px] min-h-[48px] rounded-[12px] border border-[#DDE3DF] flex items-center justify-center text-[#14211E] hover:bg-[#F7F5EF] focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Rejection public reason banner (STA-02) */}
        {report.status === 'rejected' && report.rejectionReason && (
          <div className="p-3.5 rounded-[12px] bg-[#FDECEC] border border-[#F5B8B4] text-[#B3261E] text-sm">
            <p className="font-bold">Public rejection reason (STA-02):</p>
            <p className="mt-0.5">{report.rejectionReason}</p>
          </div>
        )}

        {/* Photos: Before & Closing Proof Repair Photo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {report.photos.map((photo, idx) => (
            <div
              key={idx}
              className="rounded-[12px] border border-[#DDE3DF] overflow-hidden bg-[#14211E]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo}
                alt={`Citizen fault photo ${idx + 1} for ${report.refCode}`}
                referrerPolicy="no-referrer"
                className="w-full aspect-[4/3] object-cover"
              />
              <div className="px-3 py-1.5 bg-[#F7F5EF] text-xs font-semibold text-[#5B6B66] flex items-center justify-between">
                <span>Citizen report photo</span>
                <span>EXIF stripped</span>
              </div>
            </div>
          ))}

          {report.repairPhotoUrl && (
            <div className="rounded-[12px] border-2 border-[#1F6F57] overflow-hidden bg-[#14211E]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={report.repairPhotoUrl}
                alt={`Agency repair proof photo for ${report.refCode}`}
                referrerPolicy="no-referrer"
                className="w-full aspect-[4/3] object-cover"
              />
              <div className="px-3 py-1.5 bg-[#E6F3EE] text-xs font-bold text-[#1F6F57] flex items-center justify-between">
                <span>Agency closing repair photo</span>
                <span>Proof of fix</span>
              </div>
            </div>
          )}
        </div>

        {/* Metadata & Trust Cues (PRD 10.7: agency name and last-updated time on every report) */}
        <div className="p-3.5 rounded-[12px] bg-[#F7F5EF] border border-[#DDE3DF] space-y-1.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[#5B6B66]">Responsible Agency:</span>
            <strong className="text-[#14211E]">{report.agencyName}</strong>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[#5B6B66]">Reporter display (ACC-05):</span>
            <span className="font-semibold text-[#14211E]">
              {report.reporterDisplay}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[#5B6B66]">Last updated (WAT):</span>
            <span className="font-semibold text-[#14211E] tabular-nums">
              {formatWatDate(report.updatedAt)}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[#5B6B66]">Priority score & confirmations:</span>
            <span className="font-heading font-bold text-[#14211E] tabular-nums">
              Score {report.priorityScore.toFixed(1)} · {report.confirmationCount} resident(s) confirmed
            </span>
          </div>
        </div>

        <p className="text-sm text-[#14211E] leading-relaxed">
          {report.note || 'No additional text note added.'}
        </p>

        {/* SECTION 5.3 & CNF-02: COMMUNITY FIX VERIFICATION ("Is it fixed?") */}
        {report.status === 'fixed' && (
          <div
            role="region"
            aria-label="Community fix verification prompt"
            className="p-4 rounded-[12px] bg-[#E6F3EE] border-2 border-[#1F6F57] space-y-3"
          >
            <div>
              <h3 className="text-base font-bold text-[#14211E] font-heading">
                Is it fixed? (Confirmers within 200 m — Section 5.3 & CNF-02)
              </h3>
              <p className="text-xs text-[#5B6B66] mt-0.5">
                A report becomes <strong>Verified</strong> after 2 Yes answers or 7 days with no dispute. One No sends it back for agency review; two Nos reopen it automatically.
              </p>
              <p className="text-xs font-semibold text-[#1F6F57] mt-1 tabular-nums">
                Current tally: {report.fixYesCount}/2 Yes · {report.fixNoCount}/2 No
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => onVerifyFix(report.refCode, 'fix_yes')}
                className="min-h-[48px] px-3 py-2 rounded-[12px] bg-[#1F6F57] text-[#FFFFFF] font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Yes, it’s fixed ({report.fixYesCount})</span>
              </button>
              <button
                type="button"
                onClick={() => onVerifyFix(report.refCode, 'fix_no')}
                className="min-h-[48px] px-3 py-2 rounded-[12px] bg-[#B3261E] text-[#FFFFFF] font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>No, still broken ({report.fixNoCount})</span>
              </button>
              <button
                type="button"
                onClick={() => onVerifyFix(report.refCode, 'fix_unsure')}
                className="min-h-[48px] px-3 py-2 rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF] text-[#14211E] font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <HelpCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Not sure</span>
              </button>
            </div>
          </div>
        )}

        {/* CNF-01 "I see this too" Confirmation for Open Reports */}
        {(report.status === 'reported' ||
          report.status === 'acknowledged' ||
          report.status === 'in_progress' ||
          report.status === 'reopened') && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-[12px] bg-[#F7F5EF] border border-[#DDE3DF]">
            <div>
              <p className="text-sm font-bold text-[#14211E]">
                Pass by this spot? Confirm you see it too (CNF-01)
              </p>
              <p className="text-xs text-[#5B6B66]">
                Each resident confirmation adds +2 to the priority score (up to 20 confirmations).
              </p>
            </div>
            <button
              type="button"
              disabled={alreadyConfirmed}
              onClick={() => onConfirmSeeToo(report.refCode)}
              className={`min-h-[48px] px-4 py-2 rounded-[12px] font-semibold text-sm flex items-center gap-2 ${
                alreadyConfirmed
                  ? 'bg-[#E6F3EE] text-[#1F6F57] border border-[#1F6F57]'
                  : 'bg-[#F2B21A] text-[#14211E]'
              }`}
            >
              <ThumbsUp className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {alreadyConfirmed
                  ? `Confirmed (${report.confirmationCount})`
                  : `I see this too (${report.confirmationCount})`}
              </span>
            </button>
          </div>
        )}

        {/* STA-01 Vertical Status Stepper Timeline (Agency name only, never individual staff) */}
        <div className="pt-2">
          <h3 className="text-sm font-bold text-[#14211E] font-heading mb-3 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-[#1F6F57]" aria-hidden="true" />
            <span>Public Status Trail (STA-01)</span>
          </h3>
          <ol className="space-y-3 border-l-2 border-[#DDE3DF] ml-2.5 pl-4">
            {report.timeline.map((ev) => (
              <li key={ev.id} className="relative text-xs">
                <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#1F6F57] border-2 border-[#FFFFFF]" />
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={ev.toStatus} size="sm" />
                  <span className="font-bold text-[#14211E]">{ev.agencyName}</span>
                  <span className="text-[#5B6B66] tabular-nums">
                    · {formatWatDate(ev.createdAt)}
                  </span>
                </div>
                <p className="text-[#14211E] mt-1">{ev.note}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* MOD-02 Flag Report */}
        <div className="pt-3 border-t border-[#DDE3DF] flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowFlagMenu(!showFlagMenu)}
            className="min-h-[48px] px-3 py-1.5 rounded-[12px] text-xs font-semibold text-[#5B6B66] hover:text-[#B3261E] flex items-center gap-1.5"
          >
            <Flag className="w-4 h-4" aria-hidden="true" />
            <span>Flag report for moderator review (MOD-02)</span>
          </button>

          {showFlagMenu && (
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: 'not_infrastructure', label: 'Not infrastructure' },
                  { key: 'personal_data', label: 'Shows face / plate' },
                  { key: 'spam', label: 'Spam / duplicate' },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    onFlagReport(report.refCode, item.key);
                    setShowFlagMenu(false);
                  }}
                  className="min-h-[44px] px-3 py-1.5 rounded-[12px] border border-[#B3261E] text-[#B3261E] text-xs font-semibold"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

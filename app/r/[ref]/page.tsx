import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { INITIAL_SAMPLE_REPORTS } from '../../../lib/seed-data';
import { formatWatDate } from '../../../lib/domain';
import { buildShareablePreviewSvg } from '../../../lib/phase3-core';
import {
  StatusBadge,
  ResidentStatusBadge,
} from '../../../components/status-badges';

const CATEGORY_LABELS: Record<string, string> = {
  roads: 'Roads',
  street_lights: 'Street lights',
  drainage: 'Drainage and flooding',
  other: 'Other public infrastructure',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string }>;
}): Promise<Metadata> {
  const { ref } = await params;
  const report =
    INITIAL_SAMPLE_REPORTS.find((r) => r.refCode === ref) ??
    INITIAL_SAMPLE_REPORTS[0];

  const title = `${report.refCode} · ${report.subCategory} (${report.streetLabel}) — Fix Lagos`;
  const description = `Status: ${report.status.toUpperCase()} · Routed to ${report.agencyName} · ${report.confirmationCount} citizen confirmations.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function PublicReportSSRPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const report =
    INITIAL_SAMPLE_REPORTS.find((r) => r.refCode === ref) ??
    INITIAL_SAMPLE_REPORTS[0];

  const categoryLabel =
    CATEGORY_LABELS[report.categoryId] ?? 'Public Infrastructure';

  const previewCardSvg = buildShareablePreviewSvg({
    kind: 'report',
    title: `${report.refCode} · ${report.subCategory}`,
    subtitle: `${report.streetLabel} (${report.areaName})`,
    metricPrimary: report.status.toUpperCase(),
    metricSecondary: `${report.confirmationCount} citizen confirmations`,
    badgeText: categoryLabel.toUpperCase(),
  });

  return (
    <main className="min-h-screen bg-[#F7F5EF] text-[#14211E] py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="min-h-[48px] px-4 py-2.5 rounded-[12px] border-2 border-[#1F6F57] text-[#1F6F57] font-semibold text-sm inline-flex items-center"
          >
            ← Back to Fix Lagos Map &amp; Feed
          </Link>
          <span className="text-xs font-bold uppercase tracking-wider text-[#5B6B66]">
            Server-Rendered Public Status Record (TRN-02)
          </span>
        </div>

        <article className="bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE3DF] pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold font-heading tabular-nums">
                  {report.refCode}
                </h1>
                <StatusBadge status={report.status} />
                {report.reporterResidentStatus !== 'none' && (
                  <ResidentStatusBadge status={report.reporterResidentStatus} />
                )}
              </div>
              <p className="text-base font-semibold mt-1">
                {report.subCategory} · {report.streetLabel}
              </p>
              <p className="text-xs text-[#5B6B66] mt-0.5">
                Responsible agency: <strong>{report.agencyName}</strong> · Reported{' '}
                {formatWatDate(report.createdAt)} WAT
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-[#5B6B66] block">Priority Score</span>
              <span className="text-2xl font-bold font-heading tabular-nums text-[#1F6F57]">
                {report.priorityScore.toFixed(1)}
              </span>
            </div>
          </div>

          <p className="text-sm bg-[#F7F5EF] p-3.5 rounded-[12px] border border-[#DDE3DF]">
            {report.note}
          </p>

          <div className="space-y-2">
            <h2 className="text-sm font-bold text-[#14211E]">
              Shareable Social &amp; WhatsApp Preview Card (TRN-02)
            </h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewCardSvg}
              alt={`Shareable preview card for ${report.refCode}`}
              className="w-full rounded-[12px] border border-[#DDE3DF]"
            />
          </div>

          <div className="space-y-3 pt-2">
            <h2 className="text-base font-bold font-heading">
              Immutable Public Status Timeline (STA-01)
            </h2>
            <ol className="space-y-3 border-l-2 border-[#1F6F57] pl-4">
              {report.timeline.map((ev) => (
                <li key={ev.id} className="text-xs space-y-0.5">
                  <div className="font-bold text-[#14211E]">
                    {ev.toStatus.toUpperCase()} · {ev.agencyName}
                  </div>
                  <p className="text-[#5B6B66]">{ev.note}</p>
                  <span className="text-[11px] font-mono text-[#5B6B66]">
                    {formatWatDate(ev.createdAt)} WAT
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </article>
      </div>
    </main>
  );
}

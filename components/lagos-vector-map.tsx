'use client';

import React, { useState } from 'react';
import {
  Navigation,
  Layers,
  AlertTriangle,
  WifiOff,
  Check,
  Clock,
  Eye,
  Wrench,
  CheckCheck,
} from 'lucide-react';
import { COLORS } from '../packages/tokens/src/index';
import type { ReportRecord } from '../packages/api-client/src/index';
import { SAMPLE_PILOT_AREAS } from '../lib/seed-data';
import { clusterMapReports } from '../lib/domain';

interface LagosVectorMapProps {
  reports: ReportRecord[];
  selectedReportRef: string | null;
  onSelectReport: (report: ReportRecord) => void;
  nearMeRadiusKm: number;
  onToggleNearMeRadius: () => void;
  lowDataMode: boolean;
  onFallbackToList: () => void;
}

/**
 * MAP-01..MAP-05 Interactive Vector Map for Lagos Pilot Areas (Yaba, Surulere, Ikeja)
 * - Pins are coloured by status and carry inner icons + full screen-reader labels (PRD 10.8)
 * - Supports clustered pin view when zoomed out (MAP-01)
 * - Touch targets are 48x48px minimum (WCAG 2.2 AA)
 * - Includes tile-failure fallback trigger (MAP-04) and Low-data lighter rendering (MAP-05)
 */
export function LagosVectorMap({
  reports,
  selectedReportRef,
  onSelectReport,
  nearMeRadiusKm,
  onToggleNearMeRadius,
  lowDataMode,
  onFallbackToList,
}: LagosVectorMapProps) {
  const [tileSimulatedFail, setTileSimulatedFail] = useState(false);
  const [clusteredZoomOut, setClusteredZoomOut] = useState(false);

  // Project lat/lng within Lagos metro pilot bounds to well-spaced % coordinates matching the area polygons
  const projectPoint = (lat: number, lng: number, refCode?: string) => {
    const presetPositions: Record<string, { x: number; y: number }> = {
      'FL-5C9J3': { x: 28, y: 24 }, // Ikeja LGA
      'FL-4K7Q2': { x: 62, y: 46 }, // Sabo, Yaba
      'FL-2N6V4': { x: 52, y: 58 }, // Montgomery Rd, Yaba
      'FL-8M2P9': { x: 44, y: 44 }, // Ojuelegba-Tejuosho Link, Yaba
      'FL-9T3W6': { x: 24, y: 56 }, // Bode Thomas, Surulere
      'FL-7H5R8': { x: 31, y: 71 }, // Adeniran Ogunsanya, Surulere
    };
    if (refCode && presetPositions[refCode]) {
      return presetPositions[refCode];
    }
    const minLat = 6.48;
    const maxLat = 6.61;
    const minLng = 3.34;
    const maxLng = 3.39;
    const yPct = 100 - ((lat - minLat) / (maxLat - minLat)) * 64 - 18;
    const xPct = ((lng - minLng) / (maxLng - minLng)) * 64 + 18;
    return {
      x: Math.max(14, Math.min(84, xPct)),
      y: Math.max(18, Math.min(80, yPct)),
    };
  };

  const mapClusters = clusteredZoomOut
    ? clusterMapReports(reports, 350)
    : reports.map((r) => ({
        id: `pin-${r.refCode}`,
        lat: r.lat,
        lng: r.lng,
        count: 1,
        dominantStatus: r.status,
        reportRefs: [r.refCode],
        singleReport: r,
      }));

  if (tileSimulatedFail) {
    return (
      <div
        role="region"
        aria-label="Map tile fallback notice"
        className="flex flex-col items-center justify-center h-full min-h-[300px] p-6 text-center rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF]"
      >
        <WifiOff className="w-8 h-8 text-[#9A5A00] mb-3" aria-hidden="true" />
        <h3 className="text-lg font-bold text-[#14211E] font-heading">
          Map tiles unavailable on weak network
        </h3>
        <p className="text-sm text-[#5B6B66] mt-1 max-w-sm">
          We switched to the text list so you can still browse and report issues without using extra data (MAP-04).
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
          <button
            type="button"
            onClick={onFallbackToList}
            className="min-h-[48px] px-4 py-2.5 rounded-[12px] bg-[#F2B21A] text-[#14211E] font-semibold text-sm whitespace-nowrap focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
          >
            Open list view
          </button>
          <button
            type="button"
            onClick={() => setTileSimulatedFail(false)}
            className="min-h-[48px] px-4 py-2.5 rounded-[12px] border-2 border-[#1F6F57] text-[#1F6F57] font-semibold text-sm whitespace-nowrap focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
          >
            Retry cached vector tiles
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Interactive Lagos infrastructure fault map"
      data-testid="lagos-vector-map"
      className="relative w-full h-[320px] sm:h-[420px] lg:h-[580px] rounded-[12px] border border-[#DDE3DF] bg-[#E5ECE7] overflow-hidden select-none"
    >
      {/* Vector base map SVG (OpenStreetMap Lagos Mainland corridor stylised vector layer) */}
      <svg
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        aria-hidden="true"
      >
        <rect width="800" height="600" fill={lowDataMode ? '#EFECE4' : '#E5ECE7'} />

        {/* Lagos Lagoon water body */}
        <path
          d="M 650 0 L 800 0 L 800 600 L 600 600 C 625 460, 660 310, 640 150 Z"
          fill={lowDataMode ? '#D8E3EC' : '#C6DDF0'}
        />
        <text
          x="675"
          y="310"
          fill="#1D5FA8"
          opacity="0.75"
          fontSize="13"
          fontWeight="700"
          letterSpacing="1"
        >
          LAGOS LAGOON
        </text>

        {/* Sample Pilot Jurisdiction Polygons (Yaba LCDA, Surulere LGA, Ikeja LGA) */}
        {!lowDataMode && (
          <g>
            {/* Ikeja Sample Boundary */}
            <polygon
              points="70,70 430,70 440,210 80,215"
              fill="#1F6F57"
              fillOpacity="0.06"
              stroke="#1F6F57"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            {/* Yaba LCDA Sample Pilot Boundary */}
            <polygon
              points="340,225 610,220 595,465 335,460"
              fill="#1F6F57"
              fillOpacity="0.1"
              stroke="#1F6F57"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            {/* Surulere LGA Sample Pilot Boundary */}
            <polygon
              points="65,255 320,250 315,500 60,495"
              fill="#1D5FA8"
              fillOpacity="0.07"
              stroke="#1D5FA8"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
          </g>
        )}

        {/* Major arterial corridors */}
        <g stroke="#FFFFFF" strokeWidth="7" fill="none" strokeLinecap="round">
          <path d="M 325 40 L 330 540" />
          <path d="M 465 180 L 485 530" />
          <path d="M 50 370 L 620 340" />
          <path d="M 70 145 L 450 155" />
        </g>
        <g stroke="#CFD8D3" strokeWidth="2" fill="none">
          <path d="M 325 40 L 330 540" />
          <path d="M 465 180 L 485 530" />
          <path d="M 50 370 L 620 340" />
        </g>

        {/* Area labels */}
        <text x="95" y="102" fill="#14211E" opacity="0.75" fontSize="13" fontWeight="700">
          IKEJA LGA (SAMPLE)
        </text>
        <text x="360" y="252" fill="#1F6F57" fontSize="13" fontWeight="700">
          YABA LCDA (PILOT SAMPLE)
        </text>
        <text x="85" y="285" fill="#1D5FA8" fontSize="13" fontWeight="700">
          SURULERE LGA (PILOT SAMPLE)
        </text>

        {/* 2 km "Near me" radius indicator ring around Yaba centre (MAP-03) */}
        {nearMeRadiusKm === 2 && (
          <circle
            cx="455"
            cy="335"
            r="115"
            fill="#1F6F57"
            fillOpacity="0.07"
            stroke="#1F6F57"
            strokeWidth="2"
            strokeDasharray="8 6"
          />
        )}
      </svg>

      {/* Top-left Map Controls: 2 km radius toggle, cluster toggle & cached status */}
      <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onToggleNearMeRadius}
            aria-pressed={nearMeRadiusKm === 2}
            className={`min-h-[48px] px-3.5 py-2 rounded-[12px] border text-xs font-semibold flex items-center gap-2 transition-colors focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2 ${
              nearMeRadiusKm === 2
                ? 'bg-[#1F6F57] text-[#FFFFFF] border-[#1F6F57]'
                : 'bg-[#FFFFFF] text-[#14211E] border-[#DDE3DF]'
            }`}
          >
            <Navigation className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{nearMeRadiusKm === 2 ? 'Near me: 2 km radius' : 'All pilot areas'}</span>
          </button>

          <button
            type="button"
            onClick={() => setClusteredZoomOut(!clusteredZoomOut)}
            aria-pressed={clusteredZoomOut}
            className={`min-h-[48px] px-3 py-2 rounded-[12px] border text-xs font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2 ${
              clusteredZoomOut
                ? 'bg-[#14211E] text-[#FFFFFF] border-[#14211E]'
                : 'bg-[#FFFFFF] text-[#14211E] border-[#DDE3DF]'
            }`}
          >
            {clusteredZoomOut ? 'Clustered pins (Zoom in)' : 'Cluster pins (MAP-01)'}
          </button>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => setTileSimulatedFail(true)}
            className="min-h-[48px] px-3 py-2 rounded-[12px] bg-[#FFFFFF] border border-[#DDE3DF] text-xs font-semibold text-[#5B6B66] hover:text-[#14211E] flex items-center gap-1.5 focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
            title="Test MAP-04 automatic list fallback when vector tiles fail"
          >
            <Layers className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Test tile fallback</span>
          </button>
        </div>
      </div>

      {/* Interactive Report Pins & Clustered Pins (48x48px touch targets, status colour + icon + TalkBack/VoiceOver label) */}
      {mapClusters.map((node) => {
        if (node.count > 1) {
          const pos = projectPoint(node.lat, node.lng, node.reportRefs[0]);
          const statusToken =
            COLORS.status[node.dominantStatus] ?? COLORS.status.reported;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => setClusteredZoomOut(false)}
              aria-label={`Cluster of ${node.count} reports (${node.reportRefs.join(', ')}). Dominant status: ${statusToken.label}. Tap to expand pins.`}
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 min-w-[52px] min-h-[52px] z-20 flex items-center justify-center rounded-full focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
            >
              <span
                style={{ backgroundColor: statusToken.fg }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full border-2 border-[#F2B21A] text-[#FFFFFF] text-xs font-bold font-heading tabular-nums shadow-md"
              >
                <span>{node.count} faults</span>
              </span>
            </button>
          );
        }

        const report = node.singleReport!;
        const pos = projectPoint(report.lat, report.lng, report.refCode);
        const statusToken = COLORS.status[report.status] ?? COLORS.status.reported;
        const isSelected = selectedReportRef === report.refCode;

        const StatusPinIcon =
          report.status === 'verified'
            ? CheckCheck
            : report.status === 'fixed'
              ? Check
              : report.status === 'in_progress'
                ? Wrench
                : report.status === 'acknowledged'
                  ? Eye
                  : Clock;

        return (
          <button
            key={report.id}
            type="button"
            onClick={() => onSelectReport(report)}
            aria-label={`Map pin ${report.refCode}: ${report.subCategory} at ${report.streetLabel}. Status: ${statusToken.label}. ${report.confirmationCount} confirmations.`}
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
            }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 min-w-[48px] min-h-[48px] flex items-center justify-center rounded-full transition-transform focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2 ${
              isSelected ? 'z-20 scale-110' : 'z-10 hover:scale-105'
            }`}
          >
            <span
              style={{
                backgroundColor: statusToken.fg,
                borderColor: isSelected ? '#F2B21A' : '#FFFFFF',
              }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full border-2 text-[#FFFFFF] text-xs font-bold font-heading tabular-nums ${
                isSelected ? 'ring-4 ring-[#F2B21A]/50' : ''
              }`}
            >
              {report.isDangerous ? (
                <AlertTriangle className="w-3.5 h-3.5 text-[#F2B21A] shrink-0" aria-hidden="true" />
              ) : (
                <StatusPinIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{report.refCode.replace('FL-', '')}</span>
            </span>
          </button>
        );
      })}

      {/* Bottom Legend Bar — always pairs colour + icon + text label (PRD 10.2 & 10.8) */}
      <div className="absolute bottom-3 left-3 right-3 bg-[#FFFFFF] border border-[#DDE3DF] rounded-[12px] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-[#14211E]">Pin key:</span>
          <span className="inline-flex items-center gap-1 text-[#5B6B66]">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Reported
          </span>
          <span className="inline-flex items-center gap-1 text-[#1D5FA8]">
            <Eye className="w-3.5 h-3.5" aria-hidden="true" /> Acknowledged
          </span>
          <span className="inline-flex items-center gap-1 text-[#9A5A00]">
            <Wrench className="w-3.5 h-3.5" aria-hidden="true" /> In progress
          </span>
          <span className="inline-flex items-center gap-1 text-[#1F6F57]">
            <Check className="w-3.5 h-3.5" aria-hidden="true" /> Fixed
          </span>
          <span className="inline-flex items-center gap-1 text-[#0F5132]">
            <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" /> Verified
          </span>
        </div>
        <span className="text-[#5B6B66] tabular-nums">
          {SAMPLE_PILOT_AREAS.length} sample areas cached
        </span>
      </div>
    </div>
  );
}

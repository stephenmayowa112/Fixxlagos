'use client';

import React from 'react';
import {
  Clock,
  Eye,
  Wrench,
  Check,
  CheckCheck,
  AlertCircle,
  ShieldAlert,
  RotateCcw,
  CreditCard,
  ShieldCheck,
  Car,
  Lightbulb,
  CloudRain,
  Building2,
} from 'lucide-react';
import { COLORS, type CitizenStatusKey, type ResidentStatusKey } from '../packages/tokens/src/index';
import type { CategoryGroup } from '../packages/api-client/src/index';

export function StatusBadge({
  status,
  size = 'md',
}: {
  status: CitizenStatusKey;
  size?: 'sm' | 'md';
}) {
  const token = COLORS.status[status] ?? COLORS.status.reported;

  const IconComponent = {
    Clock,
    Eye,
    Wrench,
    Check,
    CheckCheck,
    AlertCircle,
    ShieldAlert,
    RotateCcw,
  }[token.iconName];

  return (
    <span
      role="status"
      aria-label={token.ariaDescription}
      style={{
        backgroundColor: token.bg,
        color: token.fg,
        borderColor: token.border,
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap shrink-0 ${
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-xs'
      }`}
    >
      <IconComponent className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{token.label}</span>
    </span>
  );
}

/**
 * LRS-03 & LRS-11 Resident Status Badge:
 * - 'none': nothing shown (never shame or nag users without an ID)
 * - 'provided': blue (#1D5FA8) with ID-card icon + "ID provided" label
 * - 'verified': deep green (#0F5132) with shield-check icon + "Verified resident" label
 * Never displays the raw LASRRA ID number or card photo.
 */
export function ResidentStatusBadge({ status }: { status: ResidentStatusKey }) {
  const token = COLORS.residentStatus[status];
  if (!token || !token.showBadge) {
    return null;
  }

  const Icon = status === 'verified' ? ShieldCheck : CreditCard;

  return (
    <span
      aria-label={`Resident status: ${token.label}`}
      style={{
        backgroundColor: token.bg,
        color: token.fg,
        borderColor: token.border,
      }}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap shrink-0"
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{token.label}</span>
    </span>
  );
}

export function CategoryIcon({
  category,
  className = 'w-5 h-5',
}: {
  category: CategoryGroup;
  className?: string;
}) {
  switch (category) {
    case 'roads':
      return <Car className={className} aria-hidden="true" />;
    case 'street_lights':
      return <Lightbulb className={className} aria-hidden="true" />;
    case 'drainage':
      return <CloudRain className={className} aria-hidden="true" />;
    default:
      return <Building2 className={className} aria-hidden="true" />;
  }
}

export function getCategoryLabel(category: CategoryGroup): string {
  switch (category) {
    case 'roads':
      return 'Roads';
    case 'street_lights':
      return 'Street lights';
    case 'drainage':
      return 'Drainage and flooding';
    default:
      return 'Other public infrastructure';
  }
}

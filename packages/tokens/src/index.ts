/**
 * Fix Lagos Design System Tokens (PRD Section 10)
 * Implemented strictly as tokens — never hard-coded magic values in components.
 */

export const COLORS = {
  ink: '#14211E',
  page: '#F7F5EF',
  card: '#FFFFFF',
  primaryGreen: '#1F6F57',
  actionAmber: '#F2B21A',
  infoBlue: '#1D5FA8',
  focusBlue: '#1D5FA8',
  errorRed: '#B3261E',
  mutedText: '#5B6B66',
  border: '#DDE3DF',
  status: {
    reported: {
      fg: '#5B6B66',
      bg: '#EEF1EF',
      border: '#CFD6D2',
      label: 'Reported',
      iconName: 'Clock',
      ariaDescription: 'Status: Reported, waiting for agency acknowledgement',
    },
    acknowledged: {
      fg: '#1D5FA8',
      bg: '#E8F1FA',
      border: '#B8D4F0',
      label: 'Acknowledged',
      iconName: 'Eye',
      ariaDescription: 'Status: Acknowledged by responsible agency',
    },
    in_progress: {
      fg: '#9A5A00',
      bg: '#FEF3E2',
      border: '#F3D098',
      label: 'In progress',
      iconName: 'Wrench',
      ariaDescription: 'Status: Repair work under way',
    },
    fixed: {
      fg: '#1F6F57',
      bg: '#E6F3EE',
      border: '#B0D9CC',
      label: 'Fixed',
      iconName: 'Check',
      ariaDescription: 'Status: Marked fixed by agency, awaiting citizen confirmation',
    },
    verified: {
      fg: '#0F5132',
      bg: '#DCFCE7',
      border: '#86EFAC',
      label: 'Verified',
      iconName: 'CheckCheck',
      ariaDescription: 'Status: Fix verified by community',
    },
    rejected: {
      fg: '#B3261E',
      bg: '#FDECEC',
      border: '#F5B8B4',
      label: 'Rejected',
      iconName: 'AlertCircle',
      ariaDescription: 'Status: Rejected with public reason',
    },
    pending_review: {
      fg: '#5B6B66',
      bg: '#F0F2F1',
      border: '#DDE3DF',
      label: 'Pending review',
      iconName: 'ShieldAlert',
      ariaDescription: 'Status: Held for moderator review before publishing',
    },
    reopened: {
      fg: '#9A5A00',
      bg: '#FEF3E2',
      border: '#F3D098',
      label: 'Reopened',
      iconName: 'RotateCcw',
      ariaDescription: 'Status: Reopened after community dispute',
    },
  },
  residentStatus: {
    none: {
      showBadge: false,
      label: 'No ID',
      fg: '#5B6B66',
      bg: 'transparent',
      border: 'transparent',
      iconName: null,
    },
    provided: {
      showBadge: true,
      label: 'ID provided',
      fg: '#1D5FA8',
      bg: '#E8F1FA',
      border: '#B8D4F0',
      iconName: 'IdCard',
    },
    verified: {
      showBadge: true,
      label: 'Verified resident',
      fg: '#0F5132',
      bg: '#DCFCE7',
      border: '#86EFAC',
      iconName: 'ShieldCheck',
    },
  },
  // Phase 2 Dark Mode Tokens (defined in token registry per PRD 10.2)
  darkPhase2: {
    background: '#0E1A18',
    surface: '#162826',
    text: '#F7F5EF',
    primary: '#5CC4A0',
    actionAmber: '#F2B21A',
  },
} as const;

export type CitizenStatusKey = keyof typeof COLORS.status;
export type ResidentStatusKey = keyof typeof COLORS.residentStatus;

export const TYPOGRAPHY = {
  families: {
    heading: 'var(--font-space-grotesk), system-ui, -apple-system, sans-serif',
    body: 'var(--font-inter), system-ui, -apple-system, sans-serif',
  },
  weights: {
    regular: 400,
    semibold: 600,
    bold: 700,
  },
  scale: {
    h1: { mobilePx: 28, desktopPx: 40, lineHeight: 1.25 },
    h2: { mobilePx: 22, desktopPx: 30, lineHeight: 1.3 },
    h3: { mobilePx: 18, desktopPx: 22, lineHeight: 1.35 },
    body: { mobilePx: 16, desktopPx: 17, lineHeight: 1.5 },
    small: { mobilePx: 14, desktopPx: 14, lineHeight: 1.45 },
    inputMinPx: 16,
  },
} as const;

export const SPACING = {
  unitPx: 4,
  scalePx: [4, 8, 12, 16, 24, 32, 48] as const,
  minTouchTargetPx: 48,
  minTouchGapPx: 8,
  inputHeightPx: 52,
  primaryButtonHeightPx: 52,
  mobileReportButtonSizePx: 64,
} as const;

export const RADII = {
  controlPx: 12, // buttons, inputs, cards
  bottomSheetPx: 16,
  reportButtonPx: 20,
  pillPx: 9999, // reserved strictly for status badges and filter chips
} as const;

export const BREAKPOINTS = {
  compactPhoneMax: 359,
  phoneMin: 360,
  phoneMax: 599,
  tabletMin: 600,
  tabletMax: 1023,
  laptopMin: 1024,
  laptopMax: 1439,
  desktopMin: 1440,
} as const;

/**
 * Computes WCAG 2.x relative luminance and contrast ratio between two hex colours
 * so automated CI checks verify 4.5:1 for body text and 3:1 for large/UI components.
 */
export function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const num = parseInt(normalized, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = relativeLuminance(foregroundHex);
  const l2 = relativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

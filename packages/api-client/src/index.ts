import { z } from 'zod';

/**
 * Generated & Contract-Validated TypeScript Schemas from OpenAPI 3.1 (`/api/v1`)
 */

export const CategoryGroupSchema = z.enum(['roads', 'street_lights', 'drainage', 'other']);
export type CategoryGroup = z.infer<typeof CategoryGroupSchema>;

export const CitizenStatusSchema = z.enum([
  'reported',
  'acknowledged',
  'in_progress',
  'fixed',
  'verified',
  'rejected',
  'pending_review',
  'reopened',
]);
export type CitizenStatus = z.infer<typeof CitizenStatusSchema>;

export const SeverityLevelSchema = z.enum(['low', 'medium', 'high', 'dangerous']);
export type SeverityLevel = z.infer<typeof SeverityLevelSchema>;

export const RoadOwnerSchema = z.enum(['state', 'federal', 'local', 'unknown']);
export type RoadOwner = z.infer<typeof RoadOwnerSchema>;

export const ResidentStatusSchema = z.enum(['none', 'provided', 'verified']);
export type ResidentStatus = z.infer<typeof ResidentStatusSchema>;

export const ConfirmationKindSchema = z.enum(['see_too', 'fix_yes', 'fix_no', 'fix_unsure']);
export type ConfirmationKind = z.infer<typeof ConfirmationKindSchema>;

export const FlagReasonSchema = z.enum(['not_infrastructure', 'abusive', 'personal_data', 'spam']);
export type FlagReason = z.infer<typeof FlagReasonSchema>;

export const CreateReportInputSchema = z.object({
  categoryId: CategoryGroupSchema,
  subCategory: z.string().min(2, 'Pick a specific issue type'),
  note: z.string().max(280, 'Keep your note under 280 characters').optional().default(''),
  lat: z.number().min(6.35, 'Pin must be within Lagos State').max(6.75, 'Pin must be within Lagos State'),
  lng: z.number().min(2.7, 'Pin must be within Lagos State').max(4.0, 'Pin must be within Lagos State'),
  accuracyM: z.number().min(1).max(5000),
  manualPinPlaced: z.boolean().default(false),
  areaId: z.string().default('area-yaba-sample'),
  streetLabel: z.string().min(2, 'Street or landmark description is required'),
  roadOwner: RoadOwnerSchema.default('state'),
  isDangerous: z.boolean().default(false),
  photos: z.array(z.string()).min(1, 'Take or choose at least 1 photo').max(3, 'Maximum 3 photos allowed'),
  videoAttached: z.boolean().default(false),
  videoSizeBytes: z.number().max(5 * 1024 * 1024, 'Video must be under 5 MB').optional(),
  videoDurationSec: z.number().max(15, 'Video must be 15 seconds or less').optional(),
});

export type CreateReportInput = z.infer<typeof CreateReportInputSchema>;

export const OtpRequestSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^(\+234|234|0)[789][01]\d{8}$/, 'Enter a valid 11-digit Nigerian mobile number (e.g. 0803 123 4567)'),
});

export const OtpVerifySchema = z.object({
  phone: z.string(),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit SMS code'),
});

export const LasrraSubmitSchema = z.object({
  idNumber: z
    .string()
    .trim()
    .min(8, 'Enter at least 8 characters from your LASRRA card')
    .max(20, 'LASRRA ID must be 20 characters or fewer')
    .regex(/^[A-Za-z0-9-]+$/, 'Use only letters, numbers, and hyphens'),
  consentAccepted: z.literal(true, {
    message:
      'Please tick the Nigeria Data Protection Act 2023 consent box to save your LASRRA ID',
  }),
  hasCardPhoto: z.boolean().default(false),
});

export interface StatusEventRecord {
  id: string;
  reportId: string;
  fromStatus: CitizenStatus | null;
  toStatus: CitizenStatus;
  agencyName: string; // Never individual officer names (PRD 10.5, Non-Negotiable #7)
  note: string;
  photoUrl?: string;
  createdAt: string;
}

export interface ConfirmationRecord {
  id: string;
  reportId: string;
  userId: string;
  kind: ConfirmationKind;
  distanceM: number;
  createdAt: string;
}

export interface ReportRecord {
  id: string;
  refCode: string; // e.g. FL-4K7Q2
  idempotencyKey: string;
  reporterDisplay: string; // "Anonymous resident" by default unless opted in (ACC-05)
  reporterResidentStatus: ResidentStatus; // Shown only as status badge, never ID number (LRS-03, LRS-11)
  categoryId: CategoryGroup;
  subCategory: string;
  note: string;
  lat: number;
  lng: number;
  accuracyM: number;
  areaId: string;
  areaName: string;
  streetLabel: string;
  roadOwner: RoadOwner;
  severity: SeverityLevel;
  isDangerous: boolean;
  status: CitizenStatus;
  rejectionReason?: string;
  agencyId: string | null;
  agencyName: string;
  duplicateOfRef?: string | null;
  confirmationCount: number;
  fixYesCount: number;
  fixNoCount: number;
  priorityScore: number;
  photos: string[];
  repairPhotoUrl?: string;
  videoAttached: boolean;
  videoSyncStatus?: 'none' | 'synced' | 'retrying';
  exifStripped: boolean;
  isFlagged: boolean;
  flagReasons: FlagReason[];
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string | null;
  fixedAt?: string | null;
  verifiedAt?: string | null;
  slaAckDays: number;
  isOverdue: boolean;
  timeline: StatusEventRecord[];
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    suggestedFix?: string;
    fieldErrors?: Record<string, string>;
  };
}

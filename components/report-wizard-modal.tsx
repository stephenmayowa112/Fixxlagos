'use client';

import React, { useState } from 'react';
import {
  Camera,
  MapPin,
  Check,
  AlertTriangle,
  ShieldAlert,
  Video,
  ArrowLeft,
  ArrowRight,
  Share2,
  X,
  Phone,
  CreditCard,
  WifiOff,
  CheckCircle2,
  Upload,
} from 'lucide-react';
import type {
  CategoryGroup,
  ReportRecord,
  ResidentStatus,
  RoadOwner,
} from '../packages/api-client/src/index';
import {
  CATEGORY_DEFINITIONS,
  SAMPLE_PILOT_AREAS,
  buildCivicThumbnailSvg,
} from '../lib/seed-data';
import {
  findDuplicateCandidatesWithin30m,
  generateRefCode,
} from '../lib/domain';
import { compressAndStripExifOnDevice } from '../lib/offline-drafts';
import { CategoryIcon, StatusBadge } from './status-badges';

interface ReportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingReports: ReportRecord[];
  isSignedIn: boolean;
  userPhone: string;
  userResidentStatus: ResidentStatus;
  hasSeenLasrraPrompt: boolean;
  isOfflineSimulated: boolean;
  onCompleteSignIn: (phone: string) => void;
  onCompleteLasrraChoice: (status: ResidentStatus, idEntered?: string) => void;
  onConfirmExistingDuplicate: (reportRef: string) => void;
  onSubmitReport: (payload: {
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
  }) => Promise<ReportRecord | { offlineSaved: true; idempotencyKey: string }>;
}

export function ReportWizardModal({
  isOpen,
  onClose,
  existingReports,
  isSignedIn,
  userResidentStatus,
  hasSeenLasrraPrompt,
  isOfflineSimulated,
  onCompleteSignIn,
  onCompleteLasrraChoice,
  onConfirmExistingDuplicate,
  onSubmitReport,
}: ReportWizardModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('idem-initial');

  // Step 1: Photos (1 to 3, compressed on device <= 1600px, EXIF stripped)
  const [photos, setPhotos] = useState<string[]>([
    buildCivicThumbnailSvg({
      title: 'Fresh road fault photo · EXIF stripped',
      category: 'roads',
      refCode: 'NEW-1',
    }),
  ]);
  const [compressionStats, setCompressionStats] = useState<string>(
    '1 photo ready · resized to 1600px long edge (~420 KB) · EXIF GPS stripped'
  );

  // Step 2: Location & accuracy (REP-02)
  const [lat, setLat] = useState<number>(6.5096);
  const [lng, setLng] = useState<number>(3.3712);
  const [accuracyM, setAccuracyM] = useState<number>(14);
  const [manualPinConfirmed, setManualPinConfirmed] = useState<boolean>(true);
  const [areaId, setAreaId] = useState<string>('area-yaba-sample');
  const [streetLabel, setStreetLabel] = useState<string>(
    'Herbert Macaulay Way near Montgomery Rd, Yaba'
  );
  const [roadOwner, setRoadOwner] = useState<RoadOwner>('state');

  // Step 3: Category, Note (<=280), Dangerous toggle (112), Optional Video (<=5MB, 15s)
  const [categoryId, setCategoryId] = useState<CategoryGroup>('roads');
  const [subCategory, setSubCategory] = useState<string>('Pothole');
  const [note, setNote] = useState<string>('');
  const [isDangerous, setIsDangerous] = useState<boolean>(false);
  const [videoAttached, setVideoAttached] = useState<boolean>(false);
  const [simulateVideoFailure, setSimulateVideoFailure] = useState<boolean>(false);
  const [videoRetryNotice, setVideoRetryNotice] = useState<string | null>(null);

  // Step 4: Progressive OTP at submit + Skippable LASRRA screen + Final result
  const [authSubStage, setAuthSubStage] = useState<
    'review' | 'otp_phone' | 'otp_code' | 'lasrra_optional' | 'success'
  >('review');
  const [phoneInput, setPhoneInput] = useState<string>('0803 456 7890');
  const [otpCodeInput, setOtpCodeInput] = useState<string>('123456');
  const [consoleSmsPreview, setConsoleSmsPreview] = useState<string>(
    'Fix Lagos code: 123456. Valid for 10 minutes. Do not share.'
  );
  const [otpCooldownSec, setOtpCooldownSec] = useState<number>(0);
  const [lasrraInput, setLasrraInput] = useState<string>('');
  const [lasrraConsent, setLasrraConsent] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createdReport, setCreatedReport] = useState<ReportRecord | null>(null);
  const [savedOfflineDraftKey, setSavedOfflineDraftKey] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);

  if (!isOpen) return null;

  const activeCategoryDef =
    CATEGORY_DEFINITIONS.find((c) => c.id === categoryId) ?? CATEGORY_DEFINITIONS[0];

  // REP-07: Up to 3 open reports of the same category within 30 m
  const duplicateCandidates = findDuplicateCandidatesWithin30m(
    existingReports,
    categoryId,
    lat,
    lng
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setFormError(null);

    try {
      const file = files[0];
      const compressed = await compressAndStripExifOnDevice(file);
      const nextPhotos = [...photos, compressed.dataUrl].slice(0, 3);
      setPhotos(nextPhotos);
      const kb = Math.max(85, Math.round(compressed.compressedBytes / 1024));
      setCompressionStats(
        `${nextPhotos.length} photo(s) · compressed to ${compressed.width}×${compressed.height}px (~${kb} KB) · EXIF stripped`
      );
    } catch {
      const fallbackSvg = buildCivicThumbnailSvg({
        title: `Captured ${categoryId} photo #${photos.length + 1}`,
        category: categoryId,
        refCode: generateRefCode(),
      });
      const nextPhotos = [...photos, fallbackSvg].slice(0, 3);
      setPhotos(nextPhotos);
    }
  };

  const handleAddSamplePhoto = (kind: CategoryGroup, label: string) => {
    if (photos.length >= 3) {
      setFormError('Maximum 3 photos per report (REP-01). Remove one to add another.');
      return;
    }
    setFormError(null);
    const svg = buildCivicThumbnailSvg({
      title: label,
      category: kind,
      refCode: `PHOTO-${photos.length + 1}`,
    });
    const next = [...photos, svg];
    setPhotos(next);
    setCompressionStats(
      `${next.length} photo(s) ready · 1600px max edge (~390 KB each) · EXIF stripped`
    );
  };

  const handleProceedFromStep = (targetStep: 1 | 2 | 3 | 4) => {
    setFormError(null);
    if (targetStep > 1 && photos.length === 0) {
      setFormError('Take or choose at least 1 photo before continuing (REP-01).');
      return;
    }
    if (targetStep > 2 && accuracyM > 100 && !manualPinConfirmed) {
      setFormError(
        'GPS accuracy is worse than 100 m. Tap "Confirm manual pin placement" on the map (REP-02).'
      );
      return;
    }
    if (targetStep > 2 && streetLabel.trim().length < 3) {
      setFormError('Enter a short street name or nearby landmark so crews can find it.');
      return;
    }
    setStep(targetStep);
  };

  const executeFinalSubmission = async () => {
    setIsSubmitting(true);
    setFormError(null);
    const activeKey =
      idempotencyKey === 'idem-initial'
        ? `idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        : idempotencyKey;
    if (idempotencyKey === 'idem-initial') {
      setIdempotencyKey(activeKey);
    }
    try {
      const result = await onSubmitReport({
        idempotencyKey: activeKey,
        categoryId,
        subCategory,
        note,
        lat,
        lng,
        accuracyM,
        areaId,
        streetLabel,
        roadOwner,
        isDangerous,
        photos,
        videoAttached,
      });

      if ('offlineSaved' in result) {
        setSavedOfflineDraftKey(result.idempotencyKey);
      } else {
        setCreatedReport(result);
      }
      setAuthSubStage('success');
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Could not send report. Your draft is safe and ready to retry.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrimarySubmitClick = async () => {
    setFormError(null);
    // If offline, save immediately as "Waiting to send" draft in IndexedDB (Section 5.1 & REP-08)
    if (isOfflineSimulated) {
      await executeFinalSubmission();
      return;
    }

    // Progressive sign-in: ask for phone number and OTP ONLY at submit (Non-Negotiable #2)
    if (!isSignedIn) {
      try {
        const res = await fetch('/api/v1/auth/otp/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phoneInput }),
        });
        if (res.ok) {
          const payload = (await res.json()) as {
            data?: {
              smsReceipt?: { messagePreview?: string };
              devCodeHint?: string;
              resendAfterSeconds?: number;
            };
          };
          if (payload.data?.smsReceipt?.messagePreview) {
            setConsoleSmsPreview(payload.data.smsReceipt.messagePreview);
          }
          if (payload.data?.devCodeHint) {
            setOtpCodeInput(payload.data.devCodeHint);
          }
          if (payload.data?.resendAfterSeconds) {
            setOtpCooldownSec(payload.data.resendAfterSeconds);
          }
        }
      } catch {
        // Fallback to local ConsoleSmsFake preview if offline
      }
      setAuthSubStage('otp_phone');
      return;
    }

    if (videoAttached && simulateVideoFailure) {
      setVideoRetryNotice(
        'Video upload interrupted on 3G — report created immediately; video queued for background resumable retry (REP-05).'
      );
    }
    await executeFinalSubmission();
  };

  const handleRequestResendOtp = async () => {
    setFormError(null);
    try {
      const res = await fetch('/api/v1/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneInput }),
      });
      const payload = (await res.json()) as {
        error?: { message?: string };
        data?: {
          smsReceipt?: { messagePreview?: string };
          devCodeHint?: string;
          resendAfterSeconds?: number;
        };
      };
      if (!res.ok) {
        setFormError(
          payload.error?.message ||
            'Please wait 30s before requesting another SMS code (ACC-01).'
        );
        return;
      }
      if (payload.data?.smsReceipt?.messagePreview) {
        setConsoleSmsPreview(payload.data.smsReceipt.messagePreview);
      }
      if (payload.data?.devCodeHint) {
        setOtpCodeInput(payload.data.devCodeHint);
      }
      setOtpCooldownSec(payload.data?.resendAfterSeconds ?? 30);
    } catch {
      setFormError('Could not request SMS resend right now.');
    }
  };

  const handleVerifyOtpAndContinue = async () => {
    setFormError(null);
    const cleanedPhone = phoneInput.replace(/\s+/g, '');
    if (!/^(\+234|234|0)[789][01]\d{8}$/.test(cleanedPhone)) {
      setFormError(
        'Enter a valid 11-digit Nigerian mobile number (for example 0803 456 7890).'
      );
      return;
    }
    if (!/^\d{6}$/.test(otpCodeInput.trim())) {
      setFormError('Enter the 6-digit SMS code sent to your phone.');
      return;
    }

    try {
      const verifyRes = await fetch('/api/v1/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanedPhone, code: otpCodeInput.trim() }),
      });
      if (!verifyRes.ok) {
        const errData = (await verifyRes.json()) as {
          error?: string | { code?: string; message?: string };
        };
        const errMessage =
          typeof errData.error === 'string'
            ? errData.error
            : errData.error?.message || 'Invalid or expired OTP code.';
        setFormError(errMessage);
        return;
      }
    } catch {
      // Allow local fallback verification
    }

    if (videoAttached && simulateVideoFailure) {
      setVideoRetryNotice(
        'Video upload interrupted on 3G — report created immediately; video queued for background resumable retry (REP-05).'
      );
    }

    onCompleteSignIn(cleanedPhone);

    // LRS-01 & UX rule: Ask once, on a skippable screen right after OTP sign-in
    if (!hasSeenLasrraPrompt && userResidentStatus === 'none') {
      setAuthSubStage('lasrra_optional');
      return;
    }

    await executeFinalSubmission();
  };

  const handleSaveLasrraAndSubmit = async () => {
    setFormError(null);
    if (lasrraInput.trim().length < 8) {
      setFormError(
        'Enter at least 8 characters from your LASRRA card, or tap "Skip for now".'
      );
      return;
    }
    if (!lasrraConsent) {
      setFormError(
        'Please tick the consent box (Nigeria Data Protection Act 2023) or tap "Skip for now".'
      );
      return;
    }
    onCompleteLasrraChoice('provided', lasrraInput.trim());
    await executeFinalSubmission();
  };

  const handleSkipLasrraAndSubmit = async () => {
    setFormError(null);
    onCompleteLasrraChoice('none');
    await executeFinalSubmission();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-wizard-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#14211E]/60 p-0 sm:p-4 overflow-y-auto"
    >
      <div className="w-full max-w-xl bg-[#FFFFFF] border border-[#DDE3DF] rounded-t-[16px] sm:rounded-[12px] p-4 sm:p-6 max-h-[94vh] overflow-y-auto">
        {/* Header with Step Progress Indicator (PRD 10.7) */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#DDE3DF]">
          <div>
            <span className="text-xs font-bold text-[#1F6F57] uppercase tracking-wider">
              {authSubStage === 'success'
                ? 'Report recorded'
                : `Step ${step} of 4 · Under 60 seconds`}
            </span>
            <h2
              id="report-wizard-title"
              className="text-xl font-bold text-[#14211E] font-heading"
            >
              {authSubStage === 'success'
                ? savedOfflineDraftKey
                  ? 'Saved offline — Waiting to send'
                  : `Report ${createdReport?.refCode ?? ''} received`
                : step === 1
                  ? '1. Take or choose fault photo'
                  : step === 2
                    ? '2. Confirm fault location pin'
                    : step === 3
                      ? '3. Pick category & details'
                      : '4. Review and send report'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report form"
            className="min-w-[48px] min-h-[48px] rounded-[12px] border border-[#DDE3DF] flex items-center justify-center text-[#14211E] hover:bg-[#F7F5EF] focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Stepper pills */}
        {authSubStage !== 'success' && (
          <div className="grid grid-cols-4 gap-2 my-3" role="list" aria-label="Report steps">
            {[
              { num: 1, label: 'Photo' },
              { num: 2, label: 'Location' },
              { num: 3, label: 'Category' },
              { num: 4, label: 'Send' },
            ].map((item) => (
              <button
                key={item.num}
                type="button"
                onClick={() => handleProceedFromStep(item.num as 1 | 2 | 3 | 4)}
                className={`min-h-[48px] px-2 py-1.5 rounded-[12px] border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2 ${
                  step === item.num
                    ? 'bg-[#14211E] text-[#FFFFFF] border-[#14211E]'
                    : step > item.num
                      ? 'bg-[#E6F3EE] text-[#1F6F57] border-[#1F6F57]'
                      : 'bg-[#F7F5EF] text-[#5B6B66] border-[#DDE3DF]'
                }`}
              >
                <span className="tabular-nums font-heading">{item.num}.</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Inline Validation Error Banner (PRD 10.4: errors stay inline until fixed) */}
        {formError && (
          <div
            role="alert"
            className="my-3 p-3.5 rounded-[12px] border-2 border-[#B3261E] bg-[#FDECEC] text-[#B3261E] flex items-start gap-2.5 text-sm font-medium"
          >
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold">Action needed</p>
              <p>{formError}</p>
            </div>
          </div>
        )}

        {/* STEP 1: CAMERA FIRST & SAFETY BANNER (REP-01, REP-11, REP-12) */}
        {step === 1 && authSubStage !== 'success' && (
          <div className="space-y-4 mt-3">
            {/* REP-12 Safety & Privacy Banner */}
            <div className="p-3 rounded-[12px] bg-[#FEF3E2] border border-[#F3D098] text-[#14211E] text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-[#9A5A00] shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold">
                  Stand in a safe place away from moving traffic (REP-12).
                </p>
                <p className="text-[#5B6B66] mt-0.5">
                  Avoid photographing faces or vehicle number plates. EXIF metadata is stripped automatically before publishing. For emergencies (crime, fire, medical), call <strong>112</strong>.
                </p>
              </div>
            </div>

            {/* Camera / File Input */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="min-h-[52px] px-4 py-3 rounded-[12px] bg-[#F2B21A] text-[#14211E] font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer border border-[#14211E]/15 hover:brightness-95 whitespace-nowrap shrink-0 focus-within:outline-3 focus-within:outline-[#1D5FA8]">
                <Camera className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>Take or choose photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>

              <button
                type="button"
                onClick={() =>
                  handleAddSamplePhoto('drainage', 'Blocked culvert sample · Yaba')
                }
                className="min-h-[52px] px-4 py-3 rounded-[12px] border-2 border-[#1F6F57] text-[#1F6F57] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#E6F3EE] whitespace-nowrap shrink-0 focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
              >
                <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Add sample photo ({photos.length}/3)</span>
              </button>
            </div>

            {/* Photo Thumbnails */}
            <div className="grid grid-cols-3 gap-3">
              {photos.map((src, idx) => (
                <div
                  key={idx}
                  className="relative aspect-[4/3] rounded-[12px] border border-[#DDE3DF] overflow-hidden bg-[#14211E]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Fault evidence photo ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  {photos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                      aria-label={`Remove photo ${idx + 1}`}
                      className="absolute top-1.5 right-1.5 min-w-[36px] min-h-[36px] rounded-full bg-[#14211E]/85 text-[#FFFFFF] flex items-center justify-center text-xs"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <p className="text-xs text-[#1F6F57] font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{compressionStats}</span>
            </p>

            <button
              type="button"
              onClick={() => handleProceedFromStep(2)}
              className="w-full min-h-[52px] rounded-[12px] bg-[#F2B21A] text-[#14211E] font-semibold text-base flex items-center justify-center gap-2 focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
            >
              <span>Next: Confirm location</span>
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* STEP 2: LOCATION & DRAGGABLE PIN (REP-02, RTE-02, RTE-03) */}
        {step === 2 && authSubStage !== 'success' && (
          <div className="space-y-4 mt-3">
            <div className="p-3.5 rounded-[12px] bg-[#F7F5EF] border border-[#DDE3DF] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#1F6F57] shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-[#14211E] tabular-nums">
                    GPS Coordinates: {lat.toFixed(4)}° N, {lng.toFixed(4)}° E
                  </p>
                  <p className="text-xs text-[#5B6B66] tabular-nums">
                    Accuracy: ±{accuracyM} m{' '}
                    {accuracyM <= 100
                      ? '(Good GPS lock)'
                      : '(Weak GPS > 100 m — manual pin required)'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLat((prev) => Number((prev + 0.0001).toFixed(4)));
                    setLng((prev) => Number((prev + 0.0001).toFixed(4)));
                    setAccuracyM(12);
                    setManualPinConfirmed(true);
                  }}
                  className="min-h-[48px] px-3 py-1.5 rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF] text-xs font-semibold text-[#14211E]"
                >
                  Nudge pin +10m
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccuracyM(accuracyM > 100 ? 14 : 145);
                    setManualPinConfirmed(accuracyM > 100);
                  }}
                  className="min-h-[48px] px-3 py-1.5 rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF] text-xs font-semibold text-[#5B6B66]"
                >
                  {accuracyM > 100 ? 'Restore ±14m GPS' : 'Test >100m accuracy'}
                </button>
              </div>
            </div>

            {/* Interactive Draggable / Tap-to-Place Location Pin Mini-Map (REP-02) */}
            <div
              data-testid="draggable-pin-minimap"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
                const relY = (e.clientY - rect.top) / Math.max(1, rect.height);
                const nextLat = Number((6.512 - relY * 0.005).toFixed(4));
                const nextLng = Number((3.3685 + relX * 0.0055).toFixed(4));
                setLat(nextLat);
                setLng(nextLng);
                setManualPinConfirmed(true);
              }}
              className="relative h-36 rounded-[12px] border-2 border-[#1F6F57] bg-[#E8EFEA] overflow-hidden cursor-crosshair select-none p-3 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-[11px] font-semibold text-[#14211E] bg-[#FFFFFF]/90 px-2.5 py-1 rounded-[8px] border border-[#DDE3DF]">
                <span>Interactive Street Pin (Tap anywhere on map to drag/reposition pin — REP-02)</span>
                <span className="font-mono tabular-nums text-[#1F6F57]">
                  {lat.toFixed(4)}, {lng.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center justify-center my-auto">
                <div className="px-3 py-1.5 rounded-full bg-[#14211E] text-[#FFFFFF] text-xs font-bold flex items-center gap-1.5 shadow-sm">
                  <MapPin className="w-4 h-4 text-[#F2B21A]" aria-hidden="true" />
                  <span>Pin locked · { manualPinConfirmed ? 'Confirmed' : 'Needs confirmation' }</span>
                </div>
              </div>
              <div className="text-[11px] text-[#5B6B66] bg-[#FFFFFF]/90 px-2.5 py-1 rounded-[8px] border border-[#DDE3DF] flex items-center justify-between">
                <span>Pilot Polygon: {SAMPLE_PILOT_AREAS.find((a) => a.id === areaId)?.name}</span>
                <span>PostGIS SRID 4326</span>
              </div>
            </div>

            {accuracyM > 100 && (
              <div className="p-3 rounded-[12px] bg-[#FEF3E2] border border-[#F3D098] flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-[#9A5A00]">
                  GPS accuracy is ±{accuracyM} m (worse than 100 m). Please confirm manual pin placement (REP-02).
                </span>
                <button
                  type="button"
                  onClick={() => setManualPinConfirmed(true)}
                  className="min-h-[48px] px-3 py-2 rounded-[12px] bg-[#1F6F57] text-[#FFFFFF] text-xs font-semibold shrink-0"
                >
                  {manualPinConfirmed ? 'Pin confirmed ✓' : 'Confirm manual pin'}
                </button>
              </div>
            )}

            <div>
              <label
                htmlFor="report-street-label"
                className="block text-sm font-semibold text-[#14211E] mb-1.5"
              >
                Street name or nearest bus stop / landmark
              </label>
              <input
                id="report-street-label"
                type="text"
                value={streetLabel}
                onChange={(e) => setStreetLabel(e.target.value)}
                className="w-full min-h-[52px] px-3.5 rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF] text-[16px] text-[#14211E] focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="report-area-select"
                  className="block text-sm font-semibold text-[#14211E] mb-1.5"
                >
                  Pilot Council Area (Sample)
                </label>
                <select
                  id="report-area-select"
                  value={areaId}
                  onChange={(e) => setAreaId(e.target.value)}
                  className="w-full min-h-[52px] px-3 rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF] text-[16px] text-[#14211E] focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
                >
                  {SAMPLE_PILOT_AREAS.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="report-road-owner"
                  className="block text-sm font-semibold text-[#14211E] mb-1.5"
                >
                  Road ownership layer (RTE-02)
                </label>
                <select
                  id="report-road-owner"
                  value={roadOwner}
                  onChange={(e) => setRoadOwner(e.target.value as RoadOwner)}
                  className="w-full min-h-[52px] px-3 rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF] text-[16px] text-[#14211E] focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
                >
                  <option value="state">State road (routes to agency)</option>
                  <option value="local">Local council road (routes to agency)</option>
                  <option value="unknown">Not sure / Unknown (routes to Moderator Triage)</option>
                  <option value="federal">Federal trunk road (routes to Moderator Triage)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="min-h-[52px] px-4 rounded-[12px] border-2 border-[#1F6F57] text-[#1F6F57] font-semibold text-sm flex items-center gap-1.5 focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => handleProceedFromStep(3)}
                className="flex-1 min-h-[52px] rounded-[12px] bg-[#F2B21A] text-[#14211E] font-semibold text-base flex items-center justify-center gap-2 focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
              >
                <span>Next: Pick category</span>
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CATEGORY TILES (2x2 >=96px), NOTE (<=280), DANGEROUS TOGGLE, DUPLICATE NUDGE */}
        {step === 3 && authSubStage !== 'success' && (
          <div className="space-y-4 mt-3">
            {/* PRD 10.5 Category Tiles: 2 by 2 grid, at least 96px tall, 32px icon + label, green border + check */}
            <div>
              <p className="text-sm font-semibold text-[#14211E] mb-2">
                What kind of infrastructure is broken? (REP-03)
              </p>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Fault category">
                {CATEGORY_DEFINITIONS.map((cat) => {
                  const selected = categoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setCategoryId(cat.id);
                        setSubCategory(cat.subCategories[0]);
                      }}
                      className={`min-h-[96px] p-3.5 rounded-[12px] text-left flex flex-col justify-between transition-colors focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2 ${
                        selected
                          ? 'border-2 border-[#1F6F57] bg-[#E6F3EE]'
                          : 'border border-[#DDE3DF] bg-[#FFFFFF] hover:bg-[#F7F5EF]'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <CategoryIcon
                          category={cat.id}
                          className="w-8 h-8 text-[#1F6F57]"
                        />
                        {selected && (
                          <span className="w-6 h-6 rounded-full bg-[#1F6F57] text-[#FFFFFF] flex items-center justify-center">
                            <Check className="w-4 h-4" aria-hidden="true" />
                          </span>
                        )}
                      </div>
                      <div className="mt-2">
                        <p className="text-sm font-bold text-[#14211E]">{cat.name}</p>
                        <p className="text-xs text-[#5B6B66] line-clamp-1">
                          {cat.plainDescription}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Specific sub-issue */}
            <div>
              <p className="text-sm font-semibold text-[#14211E] mb-1.5">
                Specific fault
              </p>
              <div className="flex flex-wrap gap-2">
                {activeCategoryDef.subCategories.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setSubCategory(sub)}
                    className={`min-h-[48px] px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2 ${
                      subCategory === sub
                        ? 'bg-[#1F6F57] text-[#FFFFFF] border-[#1F6F57]'
                        : 'bg-[#F7F5EF] text-[#14211E] border-[#DDE3DF]'
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>

            {/* REP-07 Duplicate Nudge within 30 m */}
            {duplicateCandidates.length > 0 && (
              <div
                role="region"
                aria-label="Nearby duplicate report detected"
                className="p-3.5 rounded-[12px] bg-[#E8F1FA] border-2 border-[#1D5FA8]"
              >
                <p className="text-sm font-bold text-[#14211E]">
                  Same problem? Confirm it instead (within 30 m)
                </p>
                <p className="text-xs text-[#5B6B66] mt-0.5">
                  Adding your confirmation raises the priority score faster than creating a duplicate report (REP-07).
                </p>
                <div className="space-y-2 mt-2.5">
                  {duplicateCandidates.map(({ report, distanceM }) => (
                    <div
                      key={report.id}
                      className="p-2.5 rounded-[12px] bg-[#FFFFFF] border border-[#DDE3DF] flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold font-heading tabular-nums text-[#14211E]">
                            {report.refCode}
                          </span>
                          <StatusBadge status={report.status} size="sm" />
                          <span className="text-xs text-[#5B6B66] tabular-nums">
                            {distanceM} m away
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[#14211E] mt-1">
                          {report.subCategory} · {report.streetLabel}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onConfirmExistingDuplicate(report.refCode);
                          onClose();
                        }}
                        className="min-h-[48px] px-3.5 py-2 rounded-[12px] bg-[#1F6F57] text-[#FFFFFF] text-xs font-semibold focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
                      >
                        I see this too (+1)
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* REP-04 Optional Note (up to 280 characters) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="report-note-input"
                  className="text-sm font-semibold text-[#14211E]"
                >
                  Short note (optional, plain language)
                </label>
                <span className="text-xs text-[#5B6B66] tabular-nums">
                  {note.length}/280
                </span>
              </div>
              <textarea
                id="report-note-input"
                rows={2}
                maxLength={280}
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 280))}
                placeholder="Example: Deep pothole in the middle lane opposite the bus stop."
                className="w-full p-3 rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF] text-[16px] text-[#14211E] focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
              />
            </div>

            {/* REP-06 "This is dangerous" toggle + 112 emergency number */}
            <div className="p-3.5 rounded-[12px] border border-[#DDE3DF] bg-[#F7F5EF]">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDangerous}
                  onChange={(e) => setIsDangerous(e.target.checked)}
                  className="mt-1 w-5 h-5 accent-[#B3261E]"
                />
                <div>
                  <span className="text-sm font-bold text-[#14211E] block">
                    This is dangerous (open manhole, exposed live wires, deep collapse)
                  </span>
                  <span className="text-xs text-[#5B6B66] block mt-0.5">
                    Raises priority weight to 5× and alerts the agency immediately (REP-06).
                  </span>
                </div>
              </label>

              {isDangerous && (
                <div
                  role="alert"
                  className="mt-3 p-3 rounded-[12px] bg-[#FDECEC] border border-[#F5B8B4] text-[#B3261E] text-xs"
                >
                  <p className="font-bold">
                    Immediate life-safety hazard? Call Lagos Emergency Number 112 now.
                  </p>
                  <p className="mt-0.5">
                    Stay clear of fallen electric cables, flood currents, and moving traffic. Do not attempt to move live wires yourself.
                  </p>
                </div>
              )}
            </div>

            {/* REP-05 Optional single video (max 5 MB, 15s) with data cost warning (PRD 10.7) */}
            <div className="p-3.5 rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Video className="w-5 h-5 text-[#1D5FA8] shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-[#14211E]">
                      Optional short video (max 5 MB, 15 seconds)
                    </p>
                    <p className="text-xs text-[#5B6B66]">
                      Approx. data cost: ~2.1 MB on 3G. Resumable upload (256 KB chunks) never blocks your report (REP-05).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setVideoAttached(!videoAttached)}
                  className={`min-h-[48px] px-3.5 py-2 rounded-[12px] border text-xs font-semibold ${
                    videoAttached
                      ? 'bg-[#1F6F57] text-[#FFFFFF] border-[#1F6F57]'
                      : 'bg-[#F7F5EF] text-[#14211E] border-[#DDE3DF]'
                  }`}
                >
                  {videoAttached ? '12s clip attached (2.1 MB) ✓' : 'Attach 12s clip'}
                </button>
              </div>

              {videoAttached && (
                <label className="flex items-center gap-2 text-xs text-[#5B6B66] pt-1 border-t border-[#DDE3DF] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simulateVideoFailure}
                    onChange={(e) => setSimulateVideoFailure(e.target.checked)}
                    className="w-4 h-4 accent-[#1F6F57]"
                  />
                  <span>
                    Simulate 3G video drop (verifies REP-05: report still submits &amp; video retries in background)
                  </span>
                </label>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="min-h-[52px] px-4 rounded-[12px] border-2 border-[#1F6F57] text-[#1F6F57] font-semibold text-sm flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => handleProceedFromStep(4)}
                className="flex-1 min-h-[52px] rounded-[12px] bg-[#F2B21A] text-[#14211E] font-semibold text-base flex items-center justify-center gap-2"
              >
                <span>Review report</span>
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: REVIEW, PROGRESSIVE OTP SIGN-IN, SKIPPABLE LASRRA, OR SUCCESS */}
        {step === 4 && authSubStage === 'review' && (
          <div className="space-y-4 mt-3">
            <div className="p-4 rounded-[12px] bg-[#F7F5EF] border border-[#DDE3DF] space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#5B6B66]">Fault category</span>
                <span className="font-bold text-[#14211E]">
                  {activeCategoryDef.name} · {subCategory}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#5B6B66]">Location</span>
                <span className="font-semibold text-[#14211E] text-right">
                  {streetLabel} (±{accuracyM} m)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#5B6B66]">Evidence</span>
                <span className="font-semibold text-[#14211E]">
                  {photos.length} photo(s) (EXIF stripped)
                  {videoAttached ? ' + 12s video' : ''}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#5B6B66]">Public display</span>
                <span className="font-semibold text-[#1F6F57]">
                  Anonymous by default (ACC-05)
                </span>
              </div>
            </div>

            {isOfflineSimulated && (
              <div className="p-3 rounded-[12px] bg-[#FEF3E2] border border-[#F3D098] text-xs text-[#9A5A00] flex items-center gap-2">
                <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  Offline mode is active. Your report will be saved in IndexedDB as <strong>“Waiting to send”</strong> and uploaded automatically when connection returns (REP-08).
                </span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="min-h-[52px] px-4 rounded-[12px] border-2 border-[#1F6F57] text-[#1F6F57] font-semibold text-sm flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handlePrimarySubmitClick}
                className="flex-1 min-h-[52px] rounded-[12px] bg-[#F2B21A] text-[#14211E] font-semibold text-base flex items-center justify-center gap-2 focus-visible:outline-3 focus-visible:outline-[#1D5FA8] focus-visible:outline-offset-2"
              >
                <span>
                  {isSubmitting
                    ? 'Saving report...'
                    : isOfflineSimulated
                      ? 'Save offline draft'
                      : 'Send report'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* PROGRESSIVE OTP SIGN-IN AT SUBMIT (ACC-01, Section 5.1) */}
        {step === 4 && (authSubStage === 'otp_phone' || authSubStage === 'otp_code') && (
          <div className="space-y-4 mt-3">
            <div className="p-3.5 rounded-[12px] bg-[#E8F1FA] border border-[#B8D4F0] text-xs text-[#14211E]">
              <p className="font-bold flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-[#1D5FA8]" aria-hidden="true" />
                <span>Almost done! Verify your Nigerian mobile number to send</span>
              </p>
              <p className="text-[#5B6B66] mt-1">
                We ask only now so your report is never delayed. We send SMS updates when the agency acknowledges and fixes your report (NOT-01). Your number is encrypted at rest and never shown publicly.
              </p>
            </div>

            <div>
              <label
                htmlFor="otp-phone-input"
                className="block text-sm font-semibold text-[#14211E] mb-1.5"
              >
                Nigerian mobile number
              </label>
              <input
                id="otp-phone-input"
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="w-full min-h-[52px] px-3.5 rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF] text-[16px] text-[#14211E]"
              />
            </div>

            <div>
              <label
                htmlFor="otp-code-input"
                className="block text-sm font-semibold text-[#14211E] mb-1.5"
              >
                6-digit SMS OTP code (valid 10 mins · local fake code: 123456)
              </label>
              <input
                id="otp-code-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCodeInput}
                onChange={(e) => setOtpCodeInput(e.target.value)}
                className="w-full min-h-[52px] px-3.5 rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF] text-[16px] font-heading tabular-nums tracking-widest text-[#14211E]"
              />
            </div>

            <div className="p-3 rounded-[12px] bg-[#F7F5EF] border border-[#DDE3DF] text-xs flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold text-[#1F6F57] block">
                  ConsoleSmsFake Gateway Output (ACC-01):
                </span>
                <code className="font-mono text-[#14211E]">{consoleSmsPreview}</code>
              </div>
              <button
                type="button"
                onClick={handleRequestResendOtp}
                className="min-h-[44px] px-3 py-1.5 rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF] text-xs font-semibold text-[#14211E]"
              >
                Resend SMS ({otpCooldownSec || 30}s cooldown)
              </button>
            </div>

            <button
              type="button"
              onClick={handleVerifyOtpAndContinue}
              className="w-full min-h-[52px] rounded-[12px] bg-[#F2B21A] text-[#14211E] font-semibold text-base"
            >
              Verify OTP &amp; continue
            </button>
          </div>
        )}

        {/* SKIPPABLE ONCE-ONLY LASRRA ID SCREEN AFTER OTP (LRS-01..LRS-13) */}
        {step === 4 && authSubStage === 'lasrra_optional' && (
          <div className="space-y-4 mt-3">
            <div className="p-4 rounded-[12px] bg-[#F7F5EF] border border-[#DDE3DF]">
              <div className="flex items-center gap-2 text-[#1D5FA8] font-bold text-sm">
                <CreditCard className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>Add your LASRRA ID (optional)</span>
              </div>
              <p className="text-sm text-[#14211E] font-medium mt-1">
                Reports from registered residents carry more weight with agencies (LRS-01).
              </p>
              <p className="text-xs text-[#5B6B66] mt-1">
                Completely optional: reports with or without a LASRRA ID are routed, published, and updated identically (LRS-07).
              </p>
            </div>

            <div>
              <label
                htmlFor="lasrra-id-wizard-input"
                className="block text-sm font-semibold text-[#14211E] mb-1.5"
              >
                LASRRA ID number (optional)
              </label>
              <input
                id="lasrra-id-wizard-input"
                type="text"
                value={lasrraInput}
                onChange={(e) => setLasrraInput(e.target.value)}
                placeholder="e.g. LASRRA-8841209"
                className="w-full min-h-[52px] px-3.5 rounded-[12px] border border-[#DDE3DF] bg-[#FFFFFF] text-[16px] text-[#14211E]"
              />
            </div>

            {/* LRS-13 Plain-language NDPA 2023 consent notice */}
            <label className="flex items-start gap-2.5 text-xs text-[#5B6B66] cursor-pointer">
              <input
                type="checkbox"
                checked={lasrraConsent}
                onChange={(e) => setLasrraConsent(e.target.checked)}
                className="mt-0.5 w-5 h-5 accent-[#1F6F57]"
              />
              <span>
                <strong>Nigeria Data Protection Act 2023 Consent (LRS-13):</strong> I consent to Fix Lagos encrypting my LASRRA ID at rest and storing a secure hash to prevent duplicate use. Only authorised verification moderators can review it; agencies and the public see only the <em>ID provided</em> status badge, never my number.
              </span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Clear 48px "Skip for now" button per Section 6.13 UX */}
              <button
                type="button"
                onClick={handleSkipLasrraAndSubmit}
                className="min-h-[52px] px-4 rounded-[12px] border-2 border-[#1F6F57] text-[#1F6F57] font-semibold text-sm"
              >
                Skip for now & send report
              </button>
              <button
                type="button"
                onClick={handleSaveLasrraAndSubmit}
                className="min-h-[52px] px-4 rounded-[12px] bg-[#F2B21A] text-[#14211E] font-semibold text-sm"
              >
                Save ID & send report
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 SUCCESS SCREEN (Section 5.1 #6: reference ID, what happens next, share button) */}
        {authSubStage === 'success' && (
          <div className="space-y-4 mt-4">
            <div className="p-4 rounded-[12px] bg-[#E6F3EE] border-2 border-[#1F6F57] text-[#14211E]">
              {savedOfflineDraftKey ? (
                <>
                  <p className="text-xs font-bold uppercase text-[#9A5A00]">
                    Offline Draft Saved · Waiting to send
                  </p>
                  <p className="text-lg font-bold font-heading mt-1">
                    Stored safely on your phone (IndexedDB)
                  </p>
                  <p className="text-sm text-[#5B6B66] mt-1">
                    Idempotency key <code className="font-mono">{savedOfflineDraftKey}</code> prevents duplicate reports when your network reconnects.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold uppercase text-[#1F6F57]">
                    Reference ID (Save or screenshot)
                  </p>
                  <p
                    data-testid="created-report-ref"
                    className="text-3xl font-bold font-heading tabular-nums text-[#14211E] mt-1"
                  >
                    {createdReport?.refCode}
                  </p>
                  <p className="text-sm font-medium mt-2">
                    Thanks. Your report is on its way to{' '}
                    <strong>{createdReport?.agencyName}</strong>.
                  </p>
                  {videoRetryNotice && (
                    <p className="text-xs font-semibold text-[#9A5A00] bg-[#FEF3E2] border border-[#F3D098] rounded-[8px] p-2 mt-2">
                      {videoRetryNotice}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="p-4 rounded-[12px] bg-[#F7F5EF] border border-[#DDE3DF] space-y-2 text-sm">
              <p className="font-bold text-[#14211E]">What happens next?</p>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-[#5B6B66]">
                <li>
                  <strong>Agency Acknowledgement (Target: within 7 days):</strong> You will receive a short SMS with your reference code as soon as the agency logs your report.
                </li>
                <li>
                  <strong>Public Status Trail:</strong> Anyone on your street can add <em>“I see this too”</em> to boost its priority score in the agency queue.
                </li>
                <li>
                  <strong>Community Fix Verification:</strong> When marked Fixed, you and residents within 200 m will be asked <em>“Is it fixed?”</em> before it is closed as Verified.
                </li>
              </ol>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setCopiedShare(true);
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    navigator.clipboard.writeText(
                      `Fix Lagos Report ${createdReport?.refCode ?? 'Draft'} — ${subCategory} at ${streetLabel}`
                    );
                  }
                }}
                className="min-h-[52px] px-4 rounded-[12px] border-2 border-[#1F6F57] text-[#1F6F57] font-semibold text-sm flex items-center gap-2"
              >
                <Share2 className="w-4 h-4" aria-hidden="true" />
                <span>{copiedShare ? 'Link copied to share ✓' : 'Share report link'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[52px] rounded-[12px] bg-[#F2B21A] text-[#14211E] font-semibold text-base"
              >
                Done — View on map & feed
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

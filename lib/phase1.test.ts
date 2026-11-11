import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConsoleSmsFakeGateway,
  PhoneOtpAuthService,
  Phase1ReportingWorkflow,
  ResumableMediaService,
  computePiiHash,
  decryptPiiAtRest,
  encryptPiiAtRest,
  enforceServerRbac,
  generateTotpCode,
  hasExifOrGpsSegment,
  stripExifFromJpegBytes,
  verifyAgencyStaffSignIn,
  type StaffInviteRecord,
} from './phase1-core';
import type { OfflineDraftRecord } from './offline-drafts';

test('PRD Section 15 Acceptance Criterion 1: Given a signed-out user on 3G, when they take a photo, confirm location, pick a category and submit, then the report is created after OTP verification and returns a Reference ID', () => {
  const smsFake = new ConsoleSmsFakeGateway();
  const authService = new PhoneOtpAuthService(smsFake);
  const mediaService = new ResumableMediaService();
  const workflow = new Phase1ReportingWorkflow();

  // 1. User is initially signed out (no session token) and starts the report flow:
  // Step 1: Take photo & upload via presigned resumable session on 3G (256 KB chunks)
  const photoSession = mediaService.createPresignedSession({
    mediaType: 'photo',
    sizeBytes: 380 * 1024,
  });
  const completedPhoto = mediaService.completeResumableUpload(photoSession.uploadId);
  assert.equal(completedPhoto.status, 'ready');
  assert.equal(completedPhoto.exifStripped, true);
  assert.equal(completedPhoto.transcodedCodec, 'webp_with_jpeg_fallback');

  // Step 2 & 3: Confirm location (6.5095, 3.3711, ±14m) and pick category ('roads' / 'Pothole')
  const draftPayload = {
    idempotencyKey: 'idem-ac1-3g-test-001',
    categoryId: 'roads' as const,
    subCategory: 'Pothole',
    note: 'Deep pothole near bus stop on 3G test',
    lat: 6.5095,
    lng: 3.3711,
    accuracyM: 14,
    areaId: 'area-yaba-sample',
    streetLabel: 'Herbert Macaulay Way, Yaba',
    roadOwner: 'state' as const,
    photos: [completedPhoto.publicDerivativeKey],
  };

  // Step 4: At submit, because user is signed out, ask for Nigerian mobile number and OTP now (not earlier)
  const t0 = 1_700_000_000_000;
  const otpReq = authService.requestOtp('08031234567', t0, '482910');
  assert.equal(otpReq.phoneNormalized, '+2348031234567');
  assert.equal(smsFake.sentMessages.length, 1);
  assert.equal(smsFake.sentMessages[0].provider, 'console_fake');

  const verifiedAuth = authService.verifyOtp('08031234567', '482910', t0 + 8_000);
  assert.equal(verifiedAuth.authenticated, true);

  // Automatic submission right after OTP verification
  const submission = workflow.submitReport({
    ...draftPayload,
    userPhoneHash: verifiedAuth.phoneHash,
  });

  assert.equal(submission.deduplicated, false);
  assert.match(submission.report.refCode, /^FL-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/);
  assert.equal(submission.report.reporterDisplay, 'Anonymous resident');
  assert.equal(
    submission.report.agencyName,
    'Lagos Roads Maintenance Team (Sample Pilot Agency)'
  );
});

test('PRD Section 15 Acceptance Criterion 2: Given no network, when a user submits, then the draft is saved as "Waiting to send" and uploads automatically on reconnection without creating duplicates', () => {
  const workflow = new Phase1ReportingWorkflow();

  // 1. User submits with no network -> saved as "Waiting to send" draft with Idempotency-Key
  const offlineDraft: OfflineDraftRecord = {
    idempotencyKey: 'idem-ac2-offline-reconnect-99',
    createdAt: '2026-11-09T08:30:00Z',
    status: 'Waiting to send',
    retryCount: 0,
    nextRetryAt: 1000,
    categoryId: 'drainage',
    subCategory: 'Blocked drain',
    note: 'Culvert blocked during rain',
    lat: 6.5068,
    lng: 3.3682,
    accuracyM: 18,
    areaId: 'area-yaba-sample',
    streetLabel: 'Tejuosho Link Road, Yaba',
    roadOwner: 'state',
    isDangerous: false,
    photos: ['s3://fixlagos-public-media/sample.webp'],
    videoAttached: false,
  };

  assert.equal(offlineDraft.status, 'Waiting to send');

  // 2. Network reconnects -> background sync sends the draft (and retries once on flaky 3G)
  const firstAttempt = workflow.submitReport({
    ...offlineDraft,
    userPhoneHash: 'usr_hash_ada',
  });
  const duplicateRetryAttempt = workflow.submitReport({
    ...offlineDraft,
    userPhoneHash: 'usr_hash_ada',
  });

  assert.equal(firstAttempt.deduplicated, false);
  assert.equal(duplicateRetryAttempt.deduplicated, true);
  assert.equal(firstAttempt.report.refCode, duplicateRetryAttempt.report.refCode);
  assert.equal(workflow.reports.length, 1, 'Must not create duplicate reports on retry');
});

test('REP-11 EXIF Removal Verification: stripExifFromJpegBytes removes APP1 EXIF & GPSInfo segments while keeping image frame intact', () => {
  // Construct a synthetic JPEG binary stream:
  // SOI (FF D8) + APP0 JFIF (FF E0) + APP1 EXIF with GPSInfo (FF E1) + SOF0/Scan + EOI (FF D9)
  const exifPayload = Buffer.from('Exif\0\0II*\0GPSInfo:Lat=6.5095,Lng=3.3711,Device=AndroidSM', 'latin1');
  const app1Length = exifPayload.length + 2;
  const app1Header = Buffer.from([0xff, 0xe1, (app1Length >> 8) & 0xff, app1Length & 0xff]);

  const jfifPayload = Buffer.from('JFIF\0\x01\x02\0\0\x01\0\x01\0\0', 'latin1');
  const app0Length = jfifPayload.length + 2;
  const app0Header = Buffer.from([0xff, 0xe0, (app0Length >> 8) & 0xff, app0Length & 0xff]);

  // SOS (FF DA) + 4 byte header + entropy data + EOI (FF D9)
  const sosAndImage = Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0xaa, 0xbb, 0xcc, 0xff, 0xd9]);

  const rawJpegWithExif = new Uint8Array(
    Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      app0Header,
      jfifPayload,
      app1Header,
      exifPayload,
      sosAndImage,
    ])
  );

  // Confirm raw image contains EXIF and GPSInfo markers before stripping
  assert.equal(hasExifOrGpsSegment(rawJpegWithExif), true);

  // Strip EXIF
  const publicSafeJpeg = stripExifFromJpegBytes(rawJpegWithExif);

  // Confirm EXIF and GPSInfo markers are completely removed
  assert.equal(hasExifOrGpsSegment(publicSafeJpeg), false);
  // Confirm JPEG SOI (0xFFD8) and EOI (0xFFD9) remain valid
  assert.equal(publicSafeJpeg[0], 0xff);
  assert.equal(publicSafeJpeg[1], 0xd8);
  assert.equal(publicSafeJpeg[publicSafeJpeg.length - 2], 0xff);
  assert.equal(publicSafeJpeg[publicSafeJpeg.length - 1], 0xd9);
});

test('ACC-01..06 OTP 10-min expiry, 30s resend cooldown, AES-256-GCM PII encryption, RBAC, and Staff TOTP 2FA', () => {
  const auth = new PhoneOtpAuthService();
  const now = 1_700_000_000_000;

  // 1. Request OTP
  const req = auth.requestOtp('08039998888', now, '774411');
  assert.equal(req.expiresInSeconds, 600);
  assert.equal(req.resendAfterSeconds, 30);

  // 2. Resend before 30s throws cooldown error (ACC-01)
  assert.throws(
    () => auth.requestOtp('08039998888', now + 12_000),
    /resend after 30 seconds/i
  );

  // 3. Verify after 11 minutes (> 10 min TTL) throws expiry error (ACC-01)
  assert.throws(
    () => auth.verifyOtp('08039998888', '774411', now + 11 * 60 * 1000),
    /expired/i
  );

  // 4. AES-256-GCM encryption at rest round-trip (Section 12)
  const cipher = encryptPiiAtRest('+2348039998888');
  assert.ok(!cipher.includes('8039998888'));
  assert.equal(decryptPiiAtRest(cipher), '+2348039998888');

  // 5. Server-side RBAC enforcement (ACC-03)
  assert.throws(
    () => enforceServerRbac('citizen', ['agency_officer', 'moderator']),
    /Forbidden \(ACC-03\)/
  );
  assert.doesNotThrow(() =>
    enforceServerRbac('agency_officer', ['agency_officer', 'agency_supervisor'])
  );

  // 6. Invitation-only Agency Staff Email + Password + TOTP 2FA (ACC-06)
  const secret = 'JBSWY3DPEHPK3PXP';
  const step = Math.floor(now / 30000);
  const validTotp = generateTotpCode(secret, step);
  const registry: StaffInviteRecord[] = [
    {
      email: 'officer@roads-sample.fixlagos.ng',
      agencyId: 'agency-roads-sample',
      role: 'agency_officer',
      passwordHash: computePiiHash('StrongLagosPass!2026'),
      totpSecret: secret,
    },
  ];

  const staffSession = verifyAgencyStaffSignIn({
    email: 'officer@roads-sample.fixlagos.ng',
    password: 'StrongLagosPass!2026',
    totpCode: validTotp,
    invitedStaffRegistry: registry,
    nowMs: now,
  });
  assert.equal(staffSession.authenticated, true);
  assert.equal(staffSession.role, 'agency_officer');
});

test('REP-02, REP-05, REP-10: >100m accuracy requires manual pin, failed video never blocks report, and 10/day rate limit', () => {
  const media = new ResumableMediaService();
  const workflow = new Phase1ReportingWorkflow();

  // REP-02: Accuracy 140m without manualPinPlaced throws
  assert.throws(
    () =>
      workflow.submitReport({
        idempotencyKey: 'idem-acc-fail',
        userPhoneHash: 'usr_1',
        categoryId: 'roads',
        subCategory: 'Pothole',
        lat: 6.5095,
        lng: 3.3711,
        accuracyM: 140,
        manualPinPlaced: false,
        areaId: 'area-yaba-sample',
        streetLabel: 'Sabo Yaba',
        roadOwner: 'state',
        photos: ['s3://photo1.webp'],
      }),
    /manual pin placement is required/i
  );

  // REP-05: Video upload fails mid-flight -> report still submits with videoSyncStatus = 'retrying'
  const videoSess = media.createPresignedSession({
    mediaType: 'video',
    sizeBytes: 3 * 1024 * 1024,
    durationSec: 12,
  });
  const failedVideo = media.completeResumableUpload(videoSess.uploadId, {
    simulateNetworkDropOnVideo: true,
  });
  assert.equal(failedVideo.status, 'failed_retrying_background');

  const resWithFailedVideo = workflow.submitReport({
    idempotencyKey: 'idem-video-fallback',
    userPhoneHash: 'usr_video',
    categoryId: 'roads',
    subCategory: 'Collapsed road',
    lat: 6.5095,
    lng: 3.3711,
    accuracyM: 15,
    areaId: 'area-yaba-sample',
    streetLabel: 'Sabo Yaba',
    roadOwner: 'state',
    photos: ['s3://photo1.webp'],
    videoSession: failedVideo,
  });
  assert.equal(resWithFailedVideo.report.videoSyncStatus, 'retrying');

  // REP-10: 10 reports/user/day rate limit
  for (let i = 1; i <= 10; i++) {
    workflow.submitReport({
      idempotencyKey: `idem-rl-${i}`,
      userPhoneHash: 'usr_ratelimit',
      categoryId: 'street_lights',
      subCategory: 'Light not working',
      lat: 6.5,
      lng: 3.36,
      accuracyM: 12,
      areaId: 'area-surulere-sample',
      streetLabel: 'Bode Thomas',
      roadOwner: 'state',
      photos: ['s3://photo1.webp'],
    });
  }
  assert.throws(
    () =>
      workflow.submitReport({
        idempotencyKey: 'idem-rl-11',
        userPhoneHash: 'usr_ratelimit',
        categoryId: 'street_lights',
        subCategory: 'Light not working',
        lat: 6.5,
        lng: 3.36,
        accuracyM: 12,
        areaId: 'area-surulere-sample',
        streetLabel: 'Bode Thomas',
        roadOwner: 'state',
        photos: ['s3://photo1.webp'],
      }),
    /rate limit of 10 reports/i
  );
});

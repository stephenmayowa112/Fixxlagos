import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scanUploadedMediaBytes,
  DatabaseBackupAndRestoreManager,
  auditPayloadForNdpaAndNeutrality,
  getProductionHealthSummary,
} from './phase4-production';
import { INITIAL_SAMPLE_REPORTS } from './seed-data';

test('PRD Section 11 & OWASP ASVS Level 2: Binary upload scanner accepts valid JPEG/WebP/PNG/MP4 magic bytes and rejects malware/scripts/executables', () => {
  // 1. Valid JPEG magic bytes (FF D8 FF E0)
  const validJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const jpegScan = scanUploadedMediaBytes({
    bytes: validJpeg,
    declaredKind: 'photo',
  });
  assert.equal(jpegScan.allowed, true);
  assert.equal(jpegScan.detectedMime, 'image/jpeg');

  // 2. Valid MP4 container ('ftyp' at offset 4)
  const validMp4 = new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  ]);
  const mp4Scan = scanUploadedMediaBytes({
    bytes: validMp4,
    declaredKind: 'video',
  });
  assert.equal(mp4Scan.allowed, true);
  assert.equal(mp4Scan.detectedMime, 'video/mp4');

  // 3. Reject executable ('MZ') or EICAR test string disguised as photo
  const eicarBytes = Buffer.from(
    'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    'utf8'
  );
  const malwareScan = scanUploadedMediaBytes({
    bytes: eicarBytes,
    declaredKind: 'photo',
  });
  assert.equal(malwareScan.allowed, false);
  assert.match(malwareScan.reason ?? '', /Security scan failed/);

  // 4. Reject embedded HTML/JS script disguised as photo
  const scriptBytes = Buffer.from('<script>alert(1)</script>', 'utf8');
  const scriptScan = scanUploadedMediaBytes({
    bytes: scriptBytes,
    declaredKind: 'photo',
  });
  assert.equal(scriptScan.allowed, false);
});

test('PRD Section 11 Backups: Daily backup snapshot creation, 30-day retention pruning, and monthly restore drill verification', () => {
  const manager = new DatabaseBackupAndRestoreManager();

  // Create old snapshot (40 days ago) and current snapshot
  const oldSnapshot = manager.createDailyBackup(
    INITIAL_SAMPLE_REPORTS,
    '2026-09-25T02:00:00Z'
  );
  const currentSnapshot = manager.createDailyBackup(
    INITIAL_SAMPLE_REPORTS,
    '2026-11-10T02:00:00Z'
  );

  assert.equal(currentSnapshot.encryptedAtRest, true);
  assert.equal(currentSnapshot.reportCount, INITIAL_SAMPLE_REPORTS.length);

  // Prune expired backups past 30-day retention
  const prunedCount = manager.pruneExpiredBackups('2026-11-10T12:00:00Z');
  assert.equal(prunedCount, 1);

  assert.throws(
    () => manager.runMonthlyRestoreDrill(oldSnapshot.snapshotId),
    /not found/
  );

  // Monthly restore drill on current snapshot succeeds & verifies checksum + PostGIS spatial bounds
  const drill = manager.runMonthlyRestoreDrill(currentSnapshot.snapshotId);
  assert.equal(drill.restoredSuccessfully, true);
  assert.equal(drill.checksumVerified, true);
  assert.equal(drill.gistSpatialIndexVerified, true);
  assert.equal(drill.restoredReportCount, INITIAL_SAMPLE_REPORTS.length);
});

test('PRD Section 12 & Non-Negotiables #5 & #7: Automated NDPA 2023 PII and Political/Official Neutrality Auditor', () => {
  // 1. Seeded public reports pass NDPA 2023 & neutrality audit with zero violations
  const cleanAudit = auditPayloadForNdpaAndNeutrality(INITIAL_SAMPLE_REPORTS);
  assert.equal(cleanAudit.compliant, true);
  assert.equal(cleanAudit.violations.length, 0);

  // 2. Payload leaking phone number, LASRRA ID, or official title is flagged immediately
  const leakyPayload = {
    refCode: 'FL-LEAK1',
    reporterPhone: '+2348031234567',
    lasrraId: 'LASRRA-8841209',
    note: 'Pothole reported to Commissioner on Herbert Macaulay Way',
  };
  const failedAudit = auditPayloadForNdpaAndNeutrality(leakyPayload);
  assert.equal(failedAudit.compliant, false);
  assert.equal(failedAudit.violations.length, 3);
});

test('PRD Section 11 & 14 Production Health & Performance Budgets (<170 KB JS, <2.5s 3G LCP, <60s report submit, 99.5% uptime target)', () => {
  const health = getProductionHealthSummary();
  assert.equal(health.status, 'healthy');
  assert.ok(
    health.performanceBudgets.citizenFirstLoadJsGzipKb <
      health.performanceBudgets.budgetLimitKb,
    'Citizen first-load JS must stay under 170 KB gzipped (Non-Negotiable #1)'
  );
  assert.ok(health.performanceBudgets.simulated3gLcpSeconds < 2.5);
  assert.ok(health.performanceBudgets.medianReportSubmitSeconds < 60);
  assert.equal(health.securityAndPrivacy.ndpa2023Compliant, true);
  assert.equal(health.securityAndPrivacy.lasrraOfficialLookupEnabled, false);
  assert.equal(health.reliabilityAndBackups.monthlyRestoreDrillPassed, true);
});

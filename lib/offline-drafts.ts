import { openDB, type IDBPDatabase } from 'idb';
import type { CategoryGroup, RoadOwner } from '../packages/api-client/src/index';

/**
 * REP-08 Offline Drafts in IndexedDB (`idb`) with Idempotency Keys & Exponential Backoff.
 * REP-01 & REP-11 Client-side photo compression (<= 1600px long edge) & EXIF stripping.
 */

export interface OfflineDraftRecord {
  idempotencyKey: string;
  createdAt: string;
  status: 'Waiting to send' | 'Syncing' | 'Failed — retrying';
  retryCount: number;
  nextRetryAt: number;
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
  videoSizeBytes?: number;
  videoDurationSec?: number;
}

const DB_NAME = 'fix_lagos_pwa_db';
const DB_VERSION = 1;
const DRAFT_STORE = 'offline_drafts';

async function getDraftDb(): Promise<IDBPDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return null;
  }
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: 'idempotencyKey' });
      }
    },
  });
}

export async function saveOfflineDraft(draft: OfflineDraftRecord): Promise<void> {
  const db = await getDraftDb();
  if (!db) return;
  await db.put(DRAFT_STORE, draft);
}

export async function listOfflineDrafts(): Promise<OfflineDraftRecord[]> {
  const db = await getDraftDb();
  if (!db) return [];
  const all = await db.getAll(DRAFT_STORE);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function removeOfflineDraft(idempotencyKey: string): Promise<void> {
  const db = await getDraftDb();
  if (!db) return;
  await db.delete(DRAFT_STORE, idempotencyKey);
}

/**
 * Exponential backoff delay in ms for draft retries (REP-08).
 */
export function computeBackoffDelayMs(retryCount: number): number {
  const baseMs = 2000;
  const maxMs = 60000;
  return Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, retryCount)));
}

/**
 * REP-01 & REP-11: Compress photo on device to <= 1600px long edge (~800 KB max)
 * and strip all EXIF metadata by re-encoding pixels onto a clean HTML5 canvas.
 */
export async function compressAndStripExifOnDevice(file: File): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
  exifStripped: true;
}> {
  const originalBytes = file.size;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read photo file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format'));
      img.onload = () => {
        const maxLongEdge = 1600;
        let width = img.naturalWidth || 1200;
        let height = img.naturalHeight || 900;

        if (width > maxLongEdge || height > maxLongEdge) {
          if (width >= height) {
            height = Math.round((height * maxLongEdge) / width);
            width = maxLongEdge;
          } else {
            width = Math.round((width * maxLongEdge) / height);
            height = maxLongEdge;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        // Drawing to canvas strips all camera EXIF headers (GPS, device serial, timestamps)
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        const compressedBytes = Math.round((dataUrl.length * 3) / 4);

        resolve({
          dataUrl,
          width,
          height,
          originalBytes,
          compressedBytes,
          exifStripped: true,
        });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

'use client';

// Prepares a file for /api/scan. Images are downscaled to 1568 px on the long edge (the size
// Claude's vision works at anyway), which cuts upload time and input tokens on phone photos.

import type { BookingScan, ReceiptScan } from './schema';
import type { ScanContext } from './scan-prompt';
import type { Trip } from './types';
import { legLabel, sortedStops } from './trip';

const MAX_EDGE = 1568;
const MAX_PDF_BYTES = 3_000_000;

export interface Media { type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'application/pdf'; data: string }

function toBase64(buf: ArrayBuffer): string {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function prepareFile(file: File): Promise<Media> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    if (file.size > MAX_PDF_BYTES) throw new Error('That PDF is over 3 MB. A screenshot of the page works just as well.');
    return { type: 'application/pdf', data: toBase64(await file.arrayBuffer()) };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This browser can't open that image type. Try a screenshot or a JPG.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.86));
  if (!blob) throw new Error("Couldn't read that image.");
  return { type: 'image/jpeg', data: toBase64(await blob.arrayBuffer()) };
}

export function scanContext(trip: Trip, today: string): ScanContext {
  return {
    tripName: trip.name,
    today,
    stops: sortedStops(trip).map(s => ({ id: s.id, name: s.name, country: s.country, arrive: s.arrive, depart: s.depart })),
    legs: trip.legs.map(l => ({ id: l.id, label: legLabel(trip, l), mode: l.mode })),
  };
}

type ScanResponse<K> = { ok: true; result: K; ms: number } | { ok: false; message: string };

export async function scan(kind: 'booking', token: string, media: Media, ctx: ScanContext): Promise<ScanResponse<BookingScan>>;
export async function scan(kind: 'receipt', token: string, media: Media, ctx: ScanContext): Promise<ScanResponse<ReceiptScan>>;
export async function scan(kind: 'booking' | 'receipt', token: string, media: Media, ctx: ScanContext) {
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, kind, media, context: ctx }),
    });
    return await res.json();
  } catch {
    return { ok: false, message: "You're offline. The form is open so you can enter it by hand." };
  }
}

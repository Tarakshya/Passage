// Runtime validation at every boundary: data from the database, and fields read by Claude.

import { z } from 'zod';
import type { Trip } from './types';

const currency = z.enum(['EUR', 'INR', 'USD', 'GBP', 'HRK', 'CHF', 'JPY']);
const mode = z.enum(['flight', 'train', 'ferry', 'bus', 'car']);
const resType = z.enum(['hotel', 'flight', 'train', 'ferry', 'bus', 'car', 'activity', 'dinner']);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

const place = z.object({ name: z.string(), country: z.string().length(2), lat: z.number(), lng: z.number(), tz: z.string() });

export const TripSchema = z.object({
  id: z.string(),
  token: z.string(),
  name: z.string(),
  home: place,
  baseCurrency: currency,
  adminId: z.string(),
  isDemo: z.boolean(),
  travelers: z.array(z.object({ id: z.string(), name: z.string(), color: z.string() })),
  stops: z.array(place.extend({ id: z.string(), order: z.number(), arrive: date, depart: date })),
  legs: z.array(z.object({ id: z.string(), from: z.string().nullable(), to: z.string().nullable(), mode, title: z.string() })),
  reservations: z.array(z.object({
    id: z.string(), type: resType, status: z.enum(['todo', 'pending', 'booked']),
    stopId: z.string().nullable(), legId: z.string().nullable(), title: z.string(),
    startLocal: local, startTz: z.string(), endLocal: local.nullable(), endTz: z.string().nullable(),
    address: z.string().nullable(), lat: z.number().nullable(), lng: z.number().nullable(),
    route: z.string().nullable(), service: z.string().nullable(), seat: z.string().nullable(),
    confirmation: z.string().nullable(), price: z.number().int().nullable(), currency: currency.nullable(),
    cancelBy: local.nullable(), source: z.enum(['manual', 'scan']),
  })),
  expenses: z.array(z.object({
    id: z.string(), title: z.string(), amount: z.number().int(), currency,
    payerId: z.string(), splitWith: z.array(z.string()), date,
    category: z.enum(['stay', 'transit', 'food', 'taxi', 'activity', 'other']),
    autoScanned: z.boolean(), pendingAmount: z.number().int().nullable(), pendingBy: z.string().nullable(),
    createdAt: z.string(),
  })),
});

export function parseTrip(data: unknown): Trip {
  return TripSchema.parse(data) as Trip;
}

// ---------- What Claude returns from a scan ----------

const conf = z.enum(['high', 'low']);
const field = <T extends z.ZodTypeAny>(t: T) => z.object({ value: t.nullable(), confidence: conf });

export const BookingScanSchema = z.object({
  isBooking: z.boolean(),
  reason: z.string().nullable(),
  type: field(resType),
  title: field(z.string()),
  startLocal: field(local),
  startTz: field(z.string()),
  endLocal: field(local),
  endTz: field(z.string()),
  address: field(z.string()),
  route: field(z.string()),
  service: field(z.string()),
  seat: field(z.string()),
  confirmation: field(z.string()),
  price: field(z.number()),
  currency: field(currency),
  cancelBy: field(local),
  suggestedStopId: field(z.string()),
  suggestedLegId: field(z.string()),
});
export type BookingScan = z.infer<typeof BookingScanSchema>;

export const ReceiptScanSchema = z.object({
  isReceipt: z.boolean(),
  reason: z.string().nullable(),
  merchant: field(z.string()),
  total: field(z.number()),
  currency: field(currency),
  date: field(date),
  category: field(z.enum(['stay', 'transit', 'food', 'taxi', 'activity', 'other'])),
});
export type ReceiptScan = z.infer<typeof ReceiptScanSchema>;

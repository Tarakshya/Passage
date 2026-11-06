// Domain model for Passage. Every type here maps 1:1 to a table in supabase/schema.sql.

export type Mode = 'flight' | 'train' | 'ferry' | 'bus' | 'car';
export type ReservationType = 'hotel' | Mode | 'activity' | 'dinner';
export type BookingStatus = 'todo' | 'pending' | 'booked';
export type Currency = 'EUR' | 'INR' | 'USD' | 'GBP' | 'HRK' | 'CHF' | 'JPY';

export const TRANSIT_TYPES: ReadonlySet<ReservationType> = new Set(['flight', 'train', 'ferry', 'bus', 'car']);

export interface Traveler {
  id: string;
  name: string;
  /** CSS colour for the avatar. */
  color: string;
}

export interface Place {
  name: string;
  country: string; // ISO 3166-1 alpha-2, used for the flag
  lat: number;
  lng: number;
  tz: string; // IANA time zone
}

export interface Stop extends Place {
  id: string;
  order: number;
  arrive: string; // YYYY-MM-DD
  depart: string; // YYYY-MM-DD
}

/** A planned move between two places. `from`/`to` null = home. */
export interface Leg {
  id: string;
  from: string | null;
  to: string | null;
  mode: Mode;
  title: string; // shown while nothing is booked, e.g. "Coastal ferry"
}

export interface Reservation {
  id: string;
  type: ReservationType;
  status: BookingStatus;
  /** Stays and activities belong to a stop; transit belongs to a leg. */
  stopId: string | null;
  legId: string | null;
  title: string;
  /** Local wall-clock time at the start place, "YYYY-MM-DDTHH:mm". */
  startLocal: string;
  startTz: string;
  endLocal: string | null;
  endTz: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** Transit only: e.g. "Wien Hbf → Attnang-Puchheim". */
  route: string | null;
  service: string | null; // e.g. "IC 548"
  seat: string | null;
  confirmation: string | null;
  price: number | null; // minor units
  currency: Currency | null;
  cancelBy: string | null; // local "YYYY-MM-DDTHH:mm"
  source: 'manual' | 'scan';
}

export interface Expense {
  id: string;
  title: string;
  amount: number; // minor units (cents / paise)
  currency: Currency;
  payerId: string;
  splitWith: string[]; // traveler ids, equal split
  date: string; // YYYY-MM-DD
  category: 'stay' | 'transit' | 'food' | 'taxi' | 'activity' | 'other';
  autoScanned: boolean;
  pendingAmount: number | null;
  pendingBy: string | null;
  createdAt: string; // ISO
}

export interface Trip {
  id: string;
  token: string;
  name: string;
  home: Place;
  baseCurrency: Currency;
  adminId: string;
  travelers: Traveler[];
  stops: Stop[];
  legs: Leg[];
  reservations: Reservation[];
  expenses: Expense[];
  isDemo: boolean;
}

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  EUR: '€', INR: '₹', USD: '$', GBP: '£', HRK: 'kn', CHF: 'CHF ', JPY: '¥',
};

/** Minor units per major unit. */
export const CURRENCY_DECIMALS: Record<Currency, number> = {
  EUR: 2, INR: 2, USD: 2, GBP: 2, HRK: 2, CHF: 2, JPY: 0,
};

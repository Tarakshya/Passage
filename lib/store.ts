// Persistence. Two implementations behind one interface:
//  • LocalStore — the demo trip (and everything, when Supabase is not configured). Lives in this
//    browser; syncs across tabs with BroadcastChannel.
//  • SupabaseStore — shared trips. Security-definer RPCs keyed by the share token; Realtime
//    broadcast tells other phones to refetch; an outbox keeps writes made while offline.

'use client';

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { buildDemoTrip, DEMO_TOKEN } from './demo';
import { applyMutation, type Mutation } from './mutations';
import { parseTrip } from './schema';
import type { Trip } from './types';

export interface TripStore {
  load(token: string): Promise<Trip | null>;
  apply(token: string, m: Mutation): Promise<void>;
  create(trip: Trip): Promise<void>;
  /** Calls back when another phone or tab changed the trip. Returns an unsubscribe. */
  subscribe(token: string, onChange: () => void): () => void;
  readonly shared: boolean;
}

const key = (token: string) => `passage:trip:${token}`;
/** Re-seed the demo after 6 hours so its relative dates stay "now". */
const DEMO_MAX_AGE_MS = 6 * 3600e3;

function readJSON<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode or full storage: the app keeps working in memory */
  }
}

let memory: Record<string, Trip> = {};

export class LocalStore implements TripStore {
  readonly shared = false;
  private bc = typeof window !== 'undefined' && 'BroadcastChannel' in window ? new BroadcastChannel('passage') : null;

  async load(token: string): Promise<Trip | null> {
    const saved = readJSON<{ trip: Trip; seededAt: number }>(key(token));
    if (token === DEMO_TOKEN && (!saved || Date.now() - saved.seededAt > DEMO_MAX_AGE_MS)) {
      return this.resetDemo();
    }
    return saved?.trip ?? memory[token] ?? null;
  }

  resetDemo(): Trip {
    const trip = buildDemoTrip(new Date());
    this.save(trip);
    return trip;
  }

  async apply(token: string, m: Mutation): Promise<void> {
    const trip = await this.load(token);
    if (!trip) return;
    this.save(applyMutation(trip, m));
    this.bc?.postMessage({ token });
  }

  async create(trip: Trip): Promise<void> {
    this.save(trip);
  }

  subscribe(token: string, onChange: () => void): () => void {
    const fn = (e: MessageEvent) => e.data?.token === token && onChange();
    this.bc?.addEventListener('message', fn);
    return () => this.bc?.removeEventListener('message', fn);
  }

  private save(trip: Trip) {
    memory[trip.token] = trip;
    const prev = readJSON<{ seededAt: number }>(key(trip.token));
    writeJSON(key(trip.token), { trip, seededAt: prev?.seededAt ?? Date.now() });
  }
}

const outboxKey = (token: string) => `passage:outbox:${token}`;
const cacheKey = (token: string) => `passage:cache:${token}`;

export class SupabaseStore implements TripStore {
  readonly shared = true;
  private db: SupabaseClient;
  private channels = new Map<string, RealtimeChannel>();

  constructor(url: string, anonKey: string) {
    this.db = createClient(url, anonKey, { auth: { persistSession: false } });
  }

  async load(token: string): Promise<Trip | null> {
    await this.flush(token);
    const { data, error } = await this.db.rpc('get_trip', { p_token: token });
    if (error) {
      // Offline or server down: show the last copy plus anything still waiting to send.
      const cached = readJSON<Trip>(cacheKey(token));
      if (!cached) throw new Error('offline');
      return this.outbox(token).reduce(applyMutation, cached);
    }
    if (!data) return null;
    const trip = parseTrip(data);
    writeJSON(cacheKey(token), trip);
    return this.outbox(token).reduce(applyMutation, trip);
  }

  async apply(token: string, m: Mutation): Promise<void> {
    const box = [...this.outbox(token), m];
    writeJSON(outboxKey(token), box);
    await this.flush(token);
  }

  async create(trip: Trip): Promise<void> {
    const { error } = await this.db.rpc('create_trip', { p_trip: trip });
    if (error) throw new Error(error.message);
  }

  subscribe(token: string, onChange: () => void): () => void {
    const ch = this.db
      .channel(`trip:${token}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'changed' }, () => onChange())
      .subscribe();
    this.channels.set(token, ch);
    const online = () => void this.flush(token).then(onChange);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('online', online);
      void this.db.removeChannel(ch);
      this.channels.delete(token);
    };
  }

  /** How many changes are waiting to send (shown as "2 changes waiting for signal"). */
  pending(token: string): number {
    return this.outbox(token).length;
  }

  private outbox(token: string): Mutation[] {
    return readJSON<Mutation[]>(outboxKey(token)) ?? [];
  }

  private flushing = new Map<string, Promise<void>>();

  /** Send queued changes in order; stop at the first network failure and keep the rest. */
  private flush(token: string): Promise<void> {
    const running = this.flushing.get(token);
    if (running) return running;
    const run = (async () => {
      let sent = 0;
      for (const m of this.outbox(token)) {
        const { error } = await this.db.rpc('apply_mutation', { p_token: token, p_m: m });
        if (error) break;
        sent++;
        writeJSON(outboxKey(token), this.outbox(token).slice(1));
      }
      if (sent) await this.channels.get(token)?.send({ type: 'broadcast', event: 'changed', payload: {} });
    })().finally(() => this.flushing.delete(token));
    this.flushing.set(token, run);
    return run;
  }
}

let local: LocalStore | null = null;
let remote: SupabaseStore | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** The demo always runs locally so reviewers can't change it for each other. */
export function storeFor(token: string): TripStore {
  if (token === DEMO_TOKEN || !supabaseConfigured()) return localStore();
  remote ??= new SupabaseStore(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return remote;
}

export function localStore(): LocalStore {
  local ??= new LocalStore();
  return local;
}

export function resetMemoryForTests() {
  memory = {};
}

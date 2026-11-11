// Daily quotas for the paid Claude features. Uses Supabase when configured so limits hold across
// serverless instances; falls back to process memory.

import { createClient } from '@supabase/supabase-js';

export type QuotaKind = 'scan' | 'recs';

const LIMITS: Record<QuotaKind, { trip: number; demo: number }> = {
  scan: { trip: Number(process.env.SCANS_PER_TRIP_PER_DAY ?? 20), demo: Number(process.env.DEMO_SCANS_PER_DAY ?? 40) },
  recs: { trip: Number(process.env.RECS_PER_TRIP_PER_DAY ?? 15), demo: Number(process.env.DEMO_RECS_PER_DAY ?? 15) },
};

const memory = new Map<string, number>();

export async function takeQuota(token: string, kind: QuotaKind): Promise<boolean> {
  const limit = token === 'demo' ? LIMITS[kind].demo : LIMITS[kind].trip;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    const db = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await db.rpc('take_quota', { p_token: token, p_kind: kind, p_limit: limit });
    if (!error) return data === true;
    console.error(JSON.stringify({ event: 'quota_error', kind, message: error.message }));
  }
  const k = `${token}:${kind}:${new Date().toISOString().slice(0, 10)}`;
  const used = memory.get(k) ?? 0;
  if (used >= limit) return false;
  memory.set(k, used + 1);
  return true;
}

/** Back-compat for the scan route. */
export const takeScan = (token: string) => takeQuota(token, 'scan');

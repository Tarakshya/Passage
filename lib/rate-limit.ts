// Scan quota: 20 per trip per day (the demo shares one bigger pool). Uses Supabase when
// configured so the limit holds across serverless instances; falls back to process memory.

import { createClient } from '@supabase/supabase-js';

export const SCANS_PER_TRIP_PER_DAY = Number(process.env.SCANS_PER_TRIP_PER_DAY ?? 20);
export const DEMO_SCANS_PER_DAY = Number(process.env.DEMO_SCANS_PER_DAY ?? 40);

const memory = new Map<string, number>();

export async function takeScan(token: string): Promise<boolean> {
  const limit = token === 'demo' ? DEMO_SCANS_PER_DAY : SCANS_PER_TRIP_PER_DAY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    const db = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await db.rpc('take_scan', { p_token: token, p_limit: limit });
    if (!error) return data === true;
    console.error(JSON.stringify({ event: 'rate_limit_error', message: error.message }));
    // fall through to memory so a database hiccup doesn't take scanning down
  }
  const k = `${token}:${new Date().toISOString().slice(0, 10)}`;
  const used = memory.get(k) ?? 0;
  if (used >= limit) return false;
  memory.set(k, used + 1);
  return true;
}

// GET /api/fx?base=EUR — daily ECB reference rates (via Frankfurter), cached for 6 hours at the edge.

import { NextResponse } from 'next/server';

export const revalidate = 21600;

const SUPPORTED = ['EUR', 'INR', 'USD', 'GBP', 'CHF', 'JPY'] as const;

export async function GET(req: Request) {
  const base = new URL(req.url).searchParams.get('base') ?? 'EUR';
  if (!SUPPORTED.includes(base as (typeof SUPPORTED)[number])) {
    return NextResponse.json({ ok: false, message: 'Unsupported base currency' }, { status: 400 });
  }
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${base}`, { next: { revalidate } });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { date: string; rates: Record<string, number> };
    // Croatia adopted the euro in 2023; HRK is fixed at 7.5345 per EUR for old receipts.
    const rates: Record<string, number> = { ...data.rates, [base]: 1 };
    if (base === 'EUR') rates.HRK = 7.5345;
    return NextResponse.json({ ok: true, base, date: data.date, rates, source: 'ECB via Frankfurter' });
  } catch {
    return NextResponse.json({ ok: false, message: 'Rates unavailable' }, { status: 502 });
  }
}

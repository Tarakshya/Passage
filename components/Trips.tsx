'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { buildDemoTrip, DEMO_TOKEN } from '@/lib/demo';
import { placeCode, sortTrips, summaryStatus, ticketRange, timeOfDay, tripSummary, type TripSummary } from '@/lib/home';
import { knownTrips, useNow, useTemp } from '@/lib/hooks';
import { storeFor } from '@/lib/store';
import { daysBetween } from '@/lib/time';
import type { Trip } from '@/lib/types';
import { TripForm } from './TripForm';
import { Icon } from './ui';

/** Saves a brand-new trip, makes its creator the admin on this phone, and opens it. */
export async function createTrip(t: Trip, go: (href: string) => void) {
  await storeFor(t.token).create(t);
  try {
    localStorage.setItem(`passage:me:${t.token}`, t.adminId);
    localStorage.setItem(`passage:askprofile:${t.token}`, '1'); // ask the creator what they love on arrival
  } catch { /* ignore */ }
  go(`/t/${t.token}`);
}

function TripCard({ s, now, temp }: { s: TripSummary; now: Date; temp: number | null }) {
  const st = summaryStatus(s, now);
  const first = s.stops[0];
  const last = s.stops.at(-1);
  const codes = [s.home, ...s.stops.map(x => x.name)].filter(Boolean).map(placeCode);
  const nights = first && last ? daysBetween(first.arrive, last.depart) : null;
  const left = s.total - s.booked;
  return (
    <Link href={`/t/${s.token}`} className={`ticket trip-card ${st.phase}`} aria-label={`${s.name}, ${st.text}`}>
      <div className="main">
        <div className="status">
          {st.phase === 'now' && <span className="live-dot" aria-hidden="true" />}
          {st.text}{st.city && ` · ${st.city.name}`}{st.city && temp !== null && `, ${temp}°`}
        </div>
        <h2>{s.name}</h2>
        {codes.length > 1 && <div className="codes" aria-hidden="true">{codes.join('  ·  ')}</div>}
        <div className="meta">
          {first && last && <div>Dates<b>{ticketRange(first.arrive, last.depart)}</b></div>}
          {nights !== null && <div>Nights<b>{nights}</b></div>}
          {s.crew.length > 0 && <div>Crew<b>{s.crew.length}</b></div>}
        </div>
      </div>
      {s.total > 0 && (
        <div className="stub">
          <small>Booked</small>
          <div className="big">{s.booked}/{s.total}</div>
          <div className="togo">{left > 0 ? `${left} to go` : 'All set'}</div>
        </div>
      )}
    </Link>
  );
}

const NO_SAMPLE = 'passage:nosample';

/**
 * `clean` is the /start link: no sample trip, just "plan your first trip". Opening /start once
 * remembers that on the phone, so "‹ Trips" from inside a trip stays clean too; the home screen
 * offers a link to bring the sample trip back.
 */
export function Trips({ clean = false }: { clean?: boolean }) {
  const router = useRouter();
  const now = useNow();
  const [list, setList] = useState<TripSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [hideSample, setHideSample] = useState(clean);

  useEffect(() => {
    let hide = clean;
    try {
      if (clean) localStorage.setItem(NO_SAMPLE, '1');
      else hide = localStorage.getItem(NO_SAMPLE) === '1';
    } catch { /* ignore */ }
    setHideSample(hide);
    // The sample is rebuilt for today so it is always mid-trip.
    const mine = knownTrips().filter(t => t.token !== DEMO_TOKEN);
    setList(hide ? mine : [...mine, tripSummary(buildDemoTrip(new Date()))]);
  }, [clean]);

  const showSample = () => {
    try { localStorage.removeItem(NO_SAMPLE); } catch { /* ignore */ }
    setHideSample(false);
    setList(l => [...(l ?? []).filter(t => !t.isDemo), tripSummary(buildDemoTrip(new Date()))]);
    if (clean) router.replace('/');
  };

  const sorted = list ? sortTrips(list.filter(t => !t.isDemo), now) : [];
  const demo = hideSample ? undefined : list?.find(t => t.isDemo);
  const live = sorted.find(t => summaryStatus(t, now).phase === 'now') ?? (demo && !sorted.length ? demo : undefined);
  const city = live ? summaryStatus(live, now).city : null;
  const temp = useTemp(city);
  const empty = list !== null && !sorted.length && !demo;

  return (
    <main className="app">
      <div className="screen home">
        <div className="wordmark">Passage</div>
        <h1 className="screen-title">{timeOfDay(now)}.</h1>
        <p className="screen-sub">
          {sorted.length ? 'Your trips' : empty ? 'Plan a trip.' : 'Here’s a sample trip to explore, or plan your own.'}
        </p>

        {!list && <div className="skeleton" style={{ height: 150, marginTop: 22 }} />}
        {empty ? (
          <div className="first-trip">
            <h2 className="how">How it works</h2>
            <ol className="tips">
              <li><b>Start with your stops.</b> Add each city and your dates. Passage lays out the route and shows what’s left to book.</li>
              <li><b>Screenshot your bookings.</b> Tap + and add a confirmation screenshot or PDF. Passage fills in the details; you confirm and save.</li>
              <li><b>Tap a city</b> to see everything booked there, plus places curated for your interests.</li>
              <li><b>Watch <span className="late">Next up</span> on the day.</b> It counts down to when you need to leave. <span className="late">Next up</span> warns you if you’re running late.</li>
              <li><b>Log what you pay in Split.</b> Scan a receipt; Passage works out who owes whom.</li>
              <li><b>Add it to your home screen</b> from your browser’s Share menu. It opens like an app and works offline.</li>
            </ol>
            <button className="btn-primary" onClick={() => setCreating(true)}>Plan a trip</button>
          </div>
        ) : (
          <>
            <div className="trip-list">
              {sorted.map(t => <TripCard key={t.token} s={t} now={now} temp={t === live ? temp : null} />)}
              {demo && sorted.length > 0 && <div className="lbl" style={{ margin: '10px 2px -4px' }}><span>Sample trip</span></div>}
              {demo && <TripCard s={demo} now={now} temp={demo === live ? temp : null} />}
            </div>
            <button className="add-row" onClick={() => setCreating(true)}><Icon name="add" />Plan a new trip</button>
          </>
        )}
        {hideSample && list !== null && <button className="quiet-link" onClick={showSample}>See a sample trip</button>}
      </div>
      {creating && <TripForm initial={null} onSave={t => createTrip(t, href => router.push(href))} onClose={() => setCreating(false)} />}
    </main>
  );
}

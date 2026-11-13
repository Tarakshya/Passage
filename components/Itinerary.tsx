'use client';

import { placeCode, routeCodes, shortCountdown, ticketRange } from '@/lib/home';
import { klookForLeg, withAid } from '@/lib/klook';
import type { LiveStatus } from '@/lib/live-status';
import { instantToZoned, fmtTime, fmtDuration } from '@/lib/time';
import { bookingProgress, currentStop, legLabel, mapStop, placeName, timeline, tripCountdown, tripDates, type TimelineItem } from '@/lib/trip';
import type { Leg, Reservation, Stop, Trip } from '@/lib/types';
import { MapView } from './MapView';
import { ArrivedStamp, Icon, TYPE_ICON, TYPE_LABEL } from './ui';

export type LiveFn = (r: Reservation) => LiveStatus | null;

export interface ItineraryHandlers {
  openStop: (s: Stop) => void;
  openReservation: (r: Reservation) => void;
  addToStop: (s: Stop, opts?: { scan?: boolean; type?: Reservation['type'] }) => void;
  addToLeg: (l: Leg) => void;
}

const LIVE_ICON = { 'on-track': 'schedule', 'leave-soon': 'directions_walk', 'at-risk': 'warning', missed: 'event_busy' } as const;
const isRide = (r: Reservation) => r.type === 'flight' || r.type === 'train' || r.type === 'ferry' || r.type === 'bus';
const leaveBy = (s: LiveStatus, r: Reservation) => instantToZoned(s.leaveBy, r.startTz).slice(11, 16);
const away = (s: LiveStatus) => (s.timeOnly ? `${s.bufferMin} min buffer · no location` : `~${fmtDuration(s.travelMin)} away`);

/** One line of words for a live booking; sits under the booking it belongs to. */
export function LiveLine({ s, r, onRebook }: { s: LiveStatus; r: Reservation; onRebook?: () => void }) {
  let text: React.ReactNode;
  if (s.state === 'on-track') text = <>Leave by <b>{leaveBy(s, r)}</b></>;
  else if (s.state === 'leave-soon') text = <>Leave in <b>{fmtDuration(s.minutesToLeave)}</b> · by {leaveBy(s, r)}</>;
  else if (s.state === 'at-risk') text = <>Leave now · you may miss it</>;
  else text = <>Missed · {isRide(r) ? 'departed' : 'started'} {fmtTime(r.startLocal)}</>;
  return (
    <div className="live" role="status">
      <Icon name={LIVE_ICON[s.state]} fill={s.state !== 'on-track'} />
      <span>{text}</span>
      {s.state === 'missed'
        ? onRebook && <span className="est" style={{ color: 'var(--lagoon)', fontWeight: 700 }}>Rebook?</span>
        : <span className="est">{away(s)}</span>}
    </div>
  );
}

const NEXT_LABEL = { 'on-track': 'Next up', 'leave-soon': 'Leave soon', 'at-risk': 'At risk', missed: 'Missed' } as const;

/** The one thing to act on next: what, when, and how long until you have to leave. */
export function NextUp({ r, s, onOpen }: { r: Reservation; s: LiveStatus; onOpen: () => void }) {
  const [head, ...rest] = r.title.split(' · ');
  const sub = [...rest, isRide(r) ? r.service : null, r.seat].filter(Boolean).join(' · ');
  const big = s.state === 'at-risk' ? 'Now' : s.state === 'missed' ? '—' : shortCountdown(s.minutesToLeave);
  const small = s.state === 'at-risk' ? 'You may miss it' : s.state === 'missed' ? 'Rebook?' : `Leave by ${leaveBy(s, r)}`;
  // The bar fills over the three hours before you have to leave.
  const pct = s.state === 'missed' || s.state === 'at-risk' ? 100 : Math.max(4, Math.min(100, 100 - (s.minutesToLeave / 180) * 100));
  const spoken = s.state === 'at-risk' ? 'leave now, you may miss it' : s.state === 'missed' ? 'missed' : `leave by ${leaveBy(s, r)}, in ${fmtDuration(s.minutesToLeave)}`;
  return (
    <button className={`next ${s.state}`} onClick={onOpen} aria-label={`${NEXT_LABEL[s.state]}: ${r.title} at ${fmtTime(r.startLocal)} — ${spoken}`}>
      <div className="k">{NEXT_LABEL[s.state]} · {fmtTime(r.startLocal)}</div>
      <div className="t">{head}</div>
      {sub && <div className="s">{sub}</div>}
      <div className="cd" role={s.state === 'at-risk' ? 'alert' : 'status'}><b>{big}</b><small>{small}</small></div>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
    </button>
  );
}

/** The trip as a paper ticket: route, dates, crew, and a tear-off stub with booking progress. */
export function Ticket({ trip, now, expanded, onToggle }: { trip: Trip; now: Date; expanded: boolean; onToggle: () => void }) {
  const dates = tripDates(trip);
  const prog = bookingProgress(trip);
  const city = mapStop(trip, now);
  const current = currentStop(trip, now);
  const left = prog.total - prog.booked;
  const done = tripCountdown(trip, now) === 'Completed';
  const route = routeCodes(trip, now);
  return (
    // The whole boarding pass is the switch: tap it to open the itinerary, tap again to fold it.
    <section className={`ticket tappable ${expanded ? "open" : ""} ${done ? "past" : ""}`} role="button" tabIndex={0} aria-expanded={expanded}
      aria-label={`${trip.name} trip. ${expanded ? 'Tap to fold the itinerary' : 'Tap to open the itinerary'}`}
      onClick={onToggle} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}>
      <div className="main">
        {city && <div className="tk-map"><MapView center={{ lat: city.lat, lng: city.lng }} zoom={12} tint={false} /></div>}
        <div className={`tk-status ${done ? 'done' : ''}`}>{tripCountdown(trip, now)}{city && current ? ` · ${city.name}` : ''}</div>
        <h2>{trip.name}</h2>
        {/* The route, starting from home: cities already behind you are crossed off, today's is underlined. */}
        <div className="codes tk-codes" aria-label={`Route: ${route.codes.join(', ')}`}>
          {route.codes.map((c, i) => (
            <span key={i}>{i > 0 && <i aria-hidden="true">·</i>}<span className={route.at > 0 && i < route.at ? 'done' : route.at > 0 && i === route.at ? 'at' : ''}>{c}</span></span>
          ))}
        </div>
        <div className="meta">
          {dates && <div>Dates<b>{ticketRange(dates.start, dates.end)}</b></div>}
          {dates && <div>Nights<b>{dates.nights}</b></div>}
          <div>Crew<b>{!done && trip.travelers.length <= 4 ? trip.travelers.map(t => t.name.slice(0, 1).toUpperCase()).join(' · ') : trip.travelers.length}</b></div>
        </div>
      </div>
      {/* A finished trip gets an arrival stamp on the paper part of the ticket. */}
      {done && dates && <ArrivedStamp code={placeCode(trip.home.name)} date={dates.end} />}
      <div className="stub" aria-label={`${prog.booked} of ${prog.total} booked`}>
        <small>Booked</small>
        <div className="big">{prog.booked}/{prog.total}</div>
        {left > 0 && <div className="togo">{left} to go</div>}
        <div className="tk-tap" aria-hidden="true">{expanded ? 'Tap to fold' : 'Tap to open'}</div>
      </div>
    </section>
  );
}

function LegLines({ trip, leg, bookings, live, h, skip }: { trip: Trip; leg: Leg; bookings: Reservation[]; live: LiveFn; h: ItineraryHandlers; skip?: string }) {
  const real = bookings.filter(b => b.status !== 'todo');
  if (!real.length) {
    const klook = klookForLeg(trip, leg);
    return (
      <div className="legline transport todo">
        <button className="leg-btn" onClick={() => h.addToLeg(leg)} aria-label={`Add the ${TYPE_LABEL[leg.mode].toLowerCase()} for ${legLabel(trip, leg)}`}>
          <span className="mode"><Icon name={TYPE_ICON[leg.mode]} className={leg.mode === 'flight' ? 'fly-down' : ''} /></span>
          <span className="tx"><b>{TYPE_LABEL[leg.mode]} to {placeName(trip, leg.to)}</b><small>From {placeName(trip, leg.from)} · not booked yet</small></span>
          <span className="st todo">To book +</span>
        </button>
        {klook && <a className="kpill" href={withAid(klook)} target="_blank" rel="noopener noreferrer">Klook <Icon name="arrow_outward" /></a>}
      </div>
    );
  }
  return (
    <>
      {real.map((b, i) => {
        const s = b.id === skip ? null : live(b);
        // A leg can take several bookings (train, then flight): the earlier ones end where their route says.
        const dest = i < real.length - 1 && b.route?.includes('→') ? b.route.split('→').at(-1)!.trim() : placeName(trip, leg.to);
        return (
          <button key={b.id} className={`legline transport ${s?.state ?? ''}`} onClick={() => h.openReservation(b)}>
            <span className="mode"><Icon name={TYPE_ICON[b.type]} className={b.type === 'flight' ? 'fly-down' : ''} /></span>
            <span className="tx">
              <b>{TYPE_LABEL[b.type]} to {dest}</b>
              <small>{[fmtTime(b.startLocal), b.service, b.status === 'booked' ? null : 'awaiting confirmation'].filter(Boolean).join(' · ')}</small>
            </span>
            <span className={`st ${b.status === 'booked' ? '' : 'pend'}`}>{b.status === 'booked' ? <><Icon name="check" />Booked</> : 'Pending'}</span>
            {s && <LiveLine s={s} r={b} onRebook={() => h.openReservation(b)} />}
          </button>
        );
      })}
    </>
  );
}

function StopStub({ stop, stays, others, here, live, h, skip }: {
  stop: Stop; stays: Reservation[]; others: Reservation[]; here: boolean; live: LiveFn; h: ItineraryHandlers; skip?: string;
}) {
  const booked = stays.filter(s => s.status === 'booked');
  const pending = stays.filter(s => s.status === 'pending');
  const empty = !booked.length && !pending.length;
  const stay = booked[0] ?? pending[0];
  // Today's live plans sit under their city; the one already shown as "Next up" says it once.
  const liveOnes = others.map(o => ({ o, s: live(o) })).filter((x): x is { o: Reservation; s: LiveStatus } => x.s !== null);
  const plans = others.length;
  const open = () => h.openStop(stop);
  return (
    <div className="stop-wrap">
      <div
        className={`stop ${empty ? 'empty' : ''} ${here ? 'here' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`${stop.name}, stop ${stop.order}${here ? ', you are here' : ''}, ${empty ? 'no stay yet' : `${stay.title}, ${booked.length ? 'booked' : 'pending'}`}`}
        onClick={open}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
      >
        {/* A fixed street map of this city, faded in from the right. */}
        <div className="st-map"><MapView center={{ lat: stop.lat, lng: stop.lng }} zoom={13} tint={false} lazy /></div>
        <span className="n">{String(stop.order).padStart(2, '0')}</span>
        <div className="c">
          <b>{stop.name}</b>
          <small>
            {here ? <i>You’re here · </i> : `${ticketRange(stop.arrive, stop.depart)} · `}{stay ? stay.title : 'No stay yet'}
            {plans > 0 && ` · ${plans} ${plans === 1 ? 'plan' : 'plans'}`}
          </small>
        </div>
        <div className="right">
          {booked.length > 0 && <span className="stamp"><Icon name="check" />Booked</span>}
          {!booked.length && pending.length > 0 && <span className="stamp pend">Pending</span>}
          {empty && (
            <>
              <button className="stamp todo" aria-label={`Add a stay in ${stop.name}`} onClick={e => { e.stopPropagation(); h.addToStop(stop, { type: 'hotel' }); }}>To book</button>
            </>
          )}
        </div>
      </div>
      {liveOnes.map(({ o, s }) => (
        <button key={o.id} className={`legline plan ${s.state}`} onClick={() => h.openReservation(o)}>
          <span className="dash" />
          <span className="tx"><Icon name={TYPE_ICON[o.type]} /> <b>{fmtTime(o.startLocal)}</b> {o.title.split(' · ')[0]}</span>
          <span className={`st ${o.status === 'booked' ? '' : 'pend'}`}>{o.status === 'booked' ? <><Icon name="check" />Booked</> : 'Pending'}</span>
          {o.id !== skip && <LiveLine s={s} r={o} onRebook={() => h.openReservation(o)} />}
        </button>
      ))}
    </div>
  );
}

export function Timeline({ trip, current, live, h, skip }: { trip: Trip; current: Stop | undefined; live: LiveFn; h: ItineraryHandlers; skip?: string }) {
  const items: TimelineItem[] = timeline(trip);
  return (
    <div>
      {items.map((it, i) => {
        if (it.kind === 'home') return null;
        if (it.kind === 'leg') return <LegLines key={it.leg.id} trip={trip} leg={it.leg} bookings={it.bookings} live={live} h={h} skip={skip} />;
        return <StopStub key={it.stop.id + i} stop={it.stop} stays={it.stays} others={it.others} here={current?.id === it.stop.id} live={live} h={h} skip={skip} />;
      })}
      <a className="osm-note" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">City maps © OpenStreetMap contributors</a>
    </div>
  );
}

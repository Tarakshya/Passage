'use client';

import type { Greeting as GreetingText } from '@/lib/home';
import { routeCodes, shortCountdown, ticketRange } from '@/lib/home';
import { klookForLeg, withAid } from '@/lib/klook';
import type { LiveStatus } from '@/lib/live-status';
import { instantToZoned, fmtTime, fmtDuration } from '@/lib/time';
import { bookingProgress, legLabel, mapStop, sortedStops, timeline, tripDates, type TimelineItem } from '@/lib/trip';
import type { Leg, Reservation, Stop, Trip } from '@/lib/types';
import { MapView } from './MapView';
import { Icon, TYPE_LABEL } from './ui';

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

export function Greeting({ g, name, temp }: { g: GreetingText; name: string; temp: number | null }) {
  return (
    <header className="hello">
      <h1>{g.hello}, {name}.<br />{g.before}{g.em && <em>{g.em}</em>}{g.after}</h1>
      <p className="dateline">{g.dateLine}{temp !== null && ` · ${temp}°C`}</p>
    </header>
  );
}

const NEXT_LABEL = { 'on-track': 'Next up', 'leave-soon': 'Leave soon', 'at-risk': 'At risk', missed: 'Missed' } as const;

/** The one thing to act on next: what, when, and how long until you have to leave. */
export function NextUp({ r, s, onOpen }: { r: Reservation; s: LiveStatus; onOpen: () => void }) {
  const [head, ...rest] = r.title.split(' · ');
  const sub = [...rest, isRide(r) ? r.service : null, r.seat].filter(Boolean).join(' · ');
  const big = s.state === 'at-risk' ? 'Now' : s.state === 'missed' ? '—' : shortCountdown(s.minutesToLeave);
  const small = s.state === 'at-risk' ? 'YOU MAY MISS IT' : s.state === 'missed' ? 'REBOOK?' : `LEAVE BY ${leaveBy(s, r)}`;
  // The bar fills over the three hours before you have to leave.
  const pct = s.state === 'missed' || s.state === 'at-risk' ? 100 : Math.max(4, Math.min(100, 100 - (s.minutesToLeave / 180) * 100));
  const spoken = s.state === 'at-risk' ? 'leave now, you may miss it' : s.state === 'missed' ? 'missed' : `leave by ${leaveBy(s, r)}, in ${fmtDuration(s.minutesToLeave)}`;
  return (
    <button className={`next ${s.state}`} onClick={onOpen} aria-label={`${NEXT_LABEL[s.state]}: ${r.title} at ${fmtTime(r.startLocal)} — ${spoken}`}>
      <div className="k">{NEXT_LABEL[s.state].toUpperCase()} · {fmtTime(r.startLocal)}</div>
      <div className="t">{head}</div>
      {sub && <div className="s">{sub}</div>}
      <div className="cd" role={s.state === 'at-risk' ? 'alert' : 'status'}><b>{big}</b><small>{small}</small></div>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
      {s.state !== 'missed' && <div className="est">{away(s)}</div>}
    </button>
  );
}

/** The trip as a paper ticket: route, dates, crew, and a tear-off stub with booking progress. */
export function Ticket({ trip, now }: { trip: Trip; now: Date }) {
  const dates = tripDates(trip);
  const prog = bookingProgress(trip);
  const { codes, at } = routeCodes(trip, now);
  const city = mapStop(trip, now);
  const left = prog.total - prog.booked;
  return (
    <section className="ticket" aria-label={`${trip.name} trip`}>
      <div className="main">
        {city && <div className="tk-map"><MapView center={{ lat: city.lat, lng: city.lng }} zoom={12} tint={false} /></div>}
        <div className="codes" aria-label={`Route: ${[trip.home.name, ...sortedStops(trip).map(s => s.name)].join(', ')}`}>
          {codes.map((c, i) => (
            <span key={i} aria-hidden="true">
              <span className={i === at ? 'at' : i < at ? 'done' : ''}>{c}</span>{i < codes.length - 1 && ' →'}
            </span>
          ))}
        </div>
        <h2>{trip.name}</h2>
        <div className="meta">
          {dates && <div>DATES<b>{ticketRange(dates.start, dates.end)}</b></div>}
          {dates && <div>NIGHTS<b>{dates.nights}</b></div>}
          <div>CREW<b>{trip.travelers.length <= 4 ? trip.travelers.map(t => t.name.slice(0, 1).toUpperCase()).join(' · ') : trip.travelers.length}</b></div>
        </div>
      </div>
      <div className="stub" aria-label={`${prog.booked} of ${prog.total} booked`}>
        <small>BOOKED</small>
        <div className="big">{prog.booked}/{prog.total}</div>
        <div className="togo">{left > 0 ? `${left} TO GO` : 'ALL SET'}</div>
      </div>
    </section>
  );
}

function bookingText(b: Reservation) {
  return <>{TYPE_LABEL[b.type]} · <b>{fmtTime(b.startLocal)}</b> · {b.service ?? b.route ?? b.title}</>;
}

function LegLines({ trip, leg, bookings, live, h }: { trip: Trip; leg: Leg; bookings: Reservation[]; live: LiveFn; h: ItineraryHandlers }) {
  const real = bookings.filter(b => b.status !== 'todo');
  if (!real.length) {
    const klook = klookForLeg(trip, leg);
    return (
      <div className="legline todo">
        <span className="dash" />
        <button className="tx" onClick={() => h.addToLeg(leg)} aria-label={`Add the ${TYPE_LABEL[leg.mode].toLowerCase()} for ${legLabel(trip, leg)}`}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{TYPE_LABEL[leg.mode]} · {legLabel(trip, leg)}</span>
          <span className="st todo">To book +</span>
        </button>
        {klook && <a className="kpill" href={withAid(klook)} target="_blank" rel="noopener noreferrer">Klook <Icon name="arrow_outward" /></a>}
      </div>
    );
  }
  return (
    <>
      {real.map(b => {
        const s = live(b);
        return (
          <button key={b.id} className={`legline ${s?.state ?? ''}`} onClick={() => h.openReservation(b)}>
            <span className="dash" />
            <span className="tx">{bookingText(b)}</span>
            <span className={`st ${b.status === 'booked' ? '' : 'pend'}`}>{b.status === 'booked' ? 'Booked' : 'Pending'}</span>
            {s && <LiveLine s={s} r={b} onRebook={() => h.openReservation(b)} />}
          </button>
        );
      })}
    </>
  );
}

function StopStub({ stop, stays, others, here, live, h }: {
  stop: Stop; stays: Reservation[]; others: Reservation[]; here: boolean; live: LiveFn; h: ItineraryHandlers;
}) {
  const booked = stays.filter(s => s.status === 'booked');
  const pending = stays.filter(s => s.status === 'pending');
  const empty = !booked.length && !pending.length;
  const stay = booked[0] ?? pending[0];
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
          {booked.length > 0 && <span className="stamp">Booked</span>}
          {!booked.length && pending.length > 0 && <span className="stamp pend">Pending</span>}
          {empty && (
            <>
              <button className="snap" aria-label={`Upload a confirmation for ${stop.name}`} onClick={e => { e.stopPropagation(); h.addToStop(stop, { scan: true, type: 'hotel' }); }}><Icon name="photo_camera" /></button>
              <button className="stamp todo" aria-label={`Add a stay in ${stop.name}`} onClick={e => { e.stopPropagation(); h.addToStop(stop, { type: 'hotel' }); }}>To book</button>
            </>
          )}
        </div>
      </div>
      {liveOnes.map(({ o, s }) => (
        <button key={o.id} className={`legline plan ${s.state}`} onClick={() => h.openReservation(o)}>
          <span className="dash" />
          <span className="tx">{TYPE_LABEL[o.type]} · <b>{fmtTime(o.startLocal)}</b> · {o.title}</span>
          <span className={`st ${o.status === 'booked' ? '' : 'pend'}`}>{o.status === 'booked' ? 'Booked' : 'Pending'}</span>
          <LiveLine s={s} r={o} onRebook={() => h.openReservation(o)} />
        </button>
      ))}
    </div>
  );
}

export function Timeline({ trip, current, live, h }: { trip: Trip; current: Stop | undefined; live: LiveFn; h: ItineraryHandlers }) {
  const items: TimelineItem[] = timeline(trip);
  return (
    <div>
      {items.map((it, i) => {
        if (it.kind === 'home') {
          return <div className="legline home" key={`home-${it.end}`}><span className="dash" />{it.place.name} · {it.end === 'start' ? 'Home' : 'Back home'}</div>;
        }
        if (it.kind === 'leg') return <LegLines key={it.leg.id} trip={trip} leg={it.leg} bookings={it.bookings} live={live} h={h} />;
        return <StopStub key={it.stop.id + i} stop={it.stop} stays={it.stays} others={it.others} here={current?.id === it.stop.id} live={live} h={h} />;
      })}
      <a className="osm-note" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">City maps © OpenStreetMap contributors</a>
    </div>
  );
}

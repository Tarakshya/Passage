'use client';

import type { LiveStatus } from '@/lib/live-status';
import { instantToZoned, fmtRange, daysBetween, fmtTime, fmtDuration } from '@/lib/time';
import { bookingProgress, flag, mapStop, sortedStops, timeline, tripCountdown, tripDates, type TimelineItem } from '@/lib/trip';
import type { Leg, Reservation, Stop, Trip } from '@/lib/types';
import { MapView } from './MapView';
import { Icon, TYPE_ICON } from './ui';

export type LiveFn = (r: Reservation) => LiveStatus | null;

export interface ItineraryHandlers {
  openStop: (s: Stop) => void;
  openReservation: (r: Reservation) => void;
  addToStop: (s: Stop, opts?: { scan?: boolean; type?: Reservation['type'] }) => void;
  addToLeg: (l: Leg) => void;
}

const LIVE_ICON = { 'on-track': 'schedule', 'leave-soon': 'directions_walk', 'at-risk': 'warning', missed: 'event_busy' } as const;

export function LiveLine({ s, r, onRebook }: { s: LiveStatus; r: Reservation; onRebook?: () => void }) {
  const by = instantToZoned(s.leaveBy, r.startTz).slice(11, 16);
  const away = s.timeOnly ? `${s.bufferMin} min buffer · no location` : `~${fmtDuration(s.travelMin)} away`;
  let text: React.ReactNode;
  if (s.state === 'on-track') text = <>Leave by <b>{by}</b></>;
  else if (s.state === 'leave-soon') text = <>Leave in <b>{fmtDuration(s.minutesToLeave)}</b> · by {by}</>;
  else if (s.state === 'at-risk') text = <><b style={{ fontFamily: 'var(--sans)', color: 'inherit' }}>Leave now</b> · you may miss it</>;
  else text = <>Missed · {r.type === 'flight' || r.type === 'train' || r.type === 'ferry' || r.type === 'bus' ? 'departed' : 'started'} {fmtTime(r.startLocal)}</>;
  return (
    <div className="live" role="status">
      <Icon name={LIVE_ICON[s.state]} fill={s.state !== 'on-track'} />
      <span>{text}</span>
      {s.state === 'missed'
        ? onRebook && <span className="est" role="link" tabIndex={0} onClick={e => { e.stopPropagation(); onRebook(); }} style={{ color: 'var(--acc-ink)', fontWeight: 700 }}>Rebook?</span>
        : <span className="est">{away}</span>}
    </div>
  );
}

export function TripTile({ trip, now, expanded, onToggle, urgent }: {
  trip: Trip; now: Date; expanded: boolean; onToggle: () => void; urgent: { s: LiveStatus; r: Reservation } | null;
}) {
  const dates = tripDates(trip);
  const stops = sortedStops(trip);
  const prog = bookingProgress(trip);
  const flags = [...new Set(stops.map(s => s.country))].map(flag).join('');
  const city = mapStop(trip, now);
  const year = dates ? dates.end.slice(0, 4) : '';
  return (
    <section className="trip-tile" aria-label={`${trip.name} trip`}>
      <div className="bg" />
      {city && <MapView center={{ lat: city.lat, lng: city.lng }} zoom={12} focusY={0.38} />}
      <div className="grid" />
      <div className="scrim" />
      <div className="top">
        <span className="glass-chip">CURRENT TRIP</span>
        <span className="glass-pill"><span className="dot" />{tripCountdown(trip, now)}</span>
      </div>
      <div className="bottom">
        {dates && <div className="dates">{fmtRange(dates.start, dates.end)}, {year} · {dates.nights} NIGHTS</div>}
        <div className="name-row">
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <span className="name">{trip.name}</span>
            <span className="flags" aria-hidden="true">{flags}</span>
          </div>
          <button className="round-glass" onClick={onToggle} aria-expanded={expanded} aria-label={expanded ? 'Collapse itinerary' : 'Expand itinerary'}>
            <Icon name={expanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} />
          </button>
        </div>
        <div className="stat-chips">
          <span className="stat-chip"><Icon name="location_on" />{stops.length} {stops.length === 1 ? 'stop' : 'stops'}</span>
          <span className="stat-chip"><Icon name="group" />{trip.travelers.length} {trip.travelers.length === 1 ? 'traveler' : 'travelers'}</span>
          <span className={`stat-chip ${prog.booked ? 'ok' : ''}`}><Icon name="check_circle" fill />{prog.booked} / {prog.total} booked</span>
        </div>
        {urgent && urgent.s.state !== 'on-track' && (
          <div className={`live-banner ${urgent.s.state}`} role="alert">
            <Icon name={LIVE_ICON[urgent.s.state]} fill />
            <span>
              {urgent.s.state === 'leave-soon' && <>Leave in {fmtDuration(urgent.s.minutesToLeave)} for {urgent.r.title}</>}
              {urgent.s.state === 'at-risk' && <>You may miss {urgent.r.title} — leave now</>}
              {urgent.s.state === 'missed' && <>{urgent.r.title} has left. Rebook?</>}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function legNodeState(bookings: Reservation[]): 'booked' | 'pending' | 'todo' {
  if (bookings.some(b => b.status === 'booked')) return 'booked';
  if (bookings.some(b => b.status === 'pending')) return 'pending';
  return 'todo';
}

function LegBlock({ trip, leg, bookings, live, h }: { trip: Trip; leg: Leg; bookings: Reservation[]; live: LiveFn; h: ItineraryHandlers }) {
  const real = bookings.filter(b => b.status !== 'todo');
  const state = legNodeState(bookings);
  if (!real.length) {
    const from = trip.stops.find(s => s.id === leg.from);
    const to = trip.stops.find(s => s.id === leg.to);
    const when = from?.depart ?? to?.arrive;
    return (
      <div className="leg">
        <div className="rail"><div className="line" /><div className="node todo"><Icon name={TYPE_ICON[leg.mode]} /></div><div className="line" /></div>
        <div className="cards">
          <button className="leg-card todo" onClick={() => h.addToLeg(leg)}>
            <div className="row">
              <div style={{ minWidth: 0 }}>
                <div className="t">{leg.title}</div>
                <div className="sub">{when ? `${fmtRange(when, when).split(' – ')[0]} · not booked` : 'Not booked yet'}</div>
              </div>
              <Icon name="add_circle" />
            </div>
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="leg">
      <div className="rail">
        {real.map((b, i) => (
          <div key={b.id} style={{ display: 'contents' }}>
            <div className={`line ${i === 0 ? '' : 'short'}`} />
            <div className={`node ${b.status === 'booked' ? 'booked' : state}`}><Icon name={TYPE_ICON[b.type]} fill /></div>
          </div>
        ))}
        <div className="line" />
      </div>
      <div className="cards">
        {real.map(b => {
          const s = live(b);
          return (
            <button key={b.id} className={`leg-card ${s?.state ?? ''}`} onClick={() => h.openReservation(b)}>
              <div className="row">
                <div style={{ minWidth: 0 }}>
                  <div className="times">{fmtTime(b.startLocal)}{b.endLocal ? ` → ${fmtTime(b.endLocal)}` : ''}</div>
                  <div className="sub">{[b.route ?? b.title, b.service].filter(Boolean).join(' · ')}</div>
                </div>
                <span className={b.status === 'booked' ? 'okdot' : 'pendot'} aria-label={b.status} />
              </div>
              {s && <LiveLine s={s} r={b} onRebook={() => h.openReservation(b)} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StopCard({ stop, stays, others, here, live, h }: {
  stop: Stop; stays: Reservation[]; others: Reservation[]; here: boolean; live: LiveFn; h: ItineraryHandlers;
}) {
  const booked = stays.filter(s => s.status === 'booked');
  const pending = stays.filter(s => s.status === 'pending');
  const nights = daysBetween(stop.arrive, stop.depart);
  const empty = !booked.length && !pending.length;
  const stay = booked[0] ?? pending[0];
  const liveOnes = others.map(o => ({ o, s: live(o) })).filter(x => x.s);
  const planned = others.length;
  const open = () => h.openStop(stop);
  return (
    <div className="cap-wrap">
      <div
        className={`cap ${empty ? 'empty' : ''} ${here ? 'here' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`${stop.name}, stop ${stop.order}${here ? ', you are here' : ''}`}
        onClick={open}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
      >
        {/* A fixed street map of this city, faded in from the right. */}
        <div className="cap-map"><MapView center={{ lat: stop.lat, lng: stop.lng }} zoom={13} tint={false} lazy /></div>
        <div className="cap-tx">
          <div className="dates">{here ? <><b>YOU’RE HERE</b> · {fmtRange(stop.arrive, stop.depart)}</> : <>{fmtRange(stop.arrive, stop.depart)} · {nights} {nights === 1 ? 'NIGHT' : 'NIGHTS'}</>}</div>
          <div className="nm"><span>{stop.name}</span> <span aria-hidden="true">{flag(stop.country)}</span></div>
          <div className={`sub ${empty ? 'todo' : ''}`}>
            {stay ? stay.title : 'No stay yet'}{planned > 0 && <span className="more"> · {planned} {planned === 1 ? 'plan' : 'plans'}</span>}
          </div>
        </div>
        <div className="cap-right">
          {booked.length > 0 && <span className="pill ok"><span className="dot" />Booked</span>}
          {!booked.length && pending.length > 0 && <span className="pill warn"><span className="dot" />Pending</span>}
          {empty && (
            <>
              <button className="round-btn acc" aria-label={`Add a stay in ${stop.name}`} onClick={e => { e.stopPropagation(); h.addToStop(stop, { type: 'hotel' }); }}><Icon name="add" /></button>
              <button className="round-btn" aria-label={`Upload a confirmation for ${stop.name}`} onClick={e => { e.stopPropagation(); h.addToStop(stop, { scan: true, type: 'hotel' }); }}><Icon name="photo_camera" /></button>
            </>
          )}
        </div>
      </div>
      {liveOnes.map(({ o, s }) => (
        <div key={o.id} className={`leg-card mini ${s!.state}`} role="button" tabIndex={0}
          onClick={() => h.openReservation(o)} onKeyDown={e => e.key === 'Enter' && h.openReservation(o)}>
          <div className="row">
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name={TYPE_ICON[o.type]} fill className="mini-ic" />
              <div style={{ minWidth: 0 }}>
                <div className="times">{fmtTime(o.startLocal)}{o.endLocal ? ` → ${fmtTime(o.endLocal)}` : ''}</div>
                <div className="sub">{o.title}</div>
              </div>
            </div>
            <span className={o.status === 'booked' ? 'okdot' : 'pendot'} aria-label={o.status} />
          </div>
          <LiveLine s={s!} r={o} onRebook={() => h.openReservation(o)} />
        </div>
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
          return (
            <div className="anchor" key={`home-${it.end}`}>
              <div className="flagtile" aria-hidden="true">{flag(it.place.country)}</div>
              <div><div className="a1">{it.place.name}</div><div className="a2">Home · {it.end}</div></div>
            </div>
          );
        }
        if (it.kind === 'leg') return <LegBlock key={it.leg.id} trip={trip} leg={it.leg} bookings={it.bookings} live={live} h={h} />;
        return <StopCard key={it.stop.id + i} stop={it.stop} stays={it.stays} others={it.others} here={current?.id === it.stop.id} live={live} h={h} />;
      })}
      <a className="osm-note" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">City maps © OpenStreetMap contributors</a>
    </div>
  );
}

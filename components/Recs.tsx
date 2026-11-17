'use client';

import { useEffect, useState } from 'react';
import { withAid } from '@/lib/klook';
import { cacheKeyFor, fetchRecs, isStale, pendingSince, savedRecs, setPending } from '@/lib/recs-client';
import type { RecSet, Stop, Trip } from '@/lib/types';
import { recKey } from '@/lib/types';
import { Icon } from './ui';

/** "RESEARCHED TODAY" / "RESEARCHED 3 DAYS AGO" — picks are a snapshot, so say how old. */
function researched(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'Researched today' : days === 1 ? 'Researched yesterday' : `Researched ${days} days ago`;
}

export function Recs({ trip, stop, me, onSave, onEditProfile }: {
  trip: Trip; stop: Stop; me: string; onSave: (s: RecSet) => void; onEditProfile: () => void;
}) {
  const [who, setWho] = useState(me);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false); // a search started before the app was closed
  const [error, setError] = useState<string | null>(null);
  const t = trip.travelers.find(x => x.id === who) ?? trip.travelers[0];
  const set = trip.recs?.[recKey(stop.id, t.id)];
  const ready = (t.profile?.interests.length ?? 0) > 0;
  const mine = t.id === me;
  const hasKlook = Boolean(set?.items.some(r => r.klook));

  // Picks are saved by the server as soon as they're ready. When the city opens, collect any that
  // arrived while the app was closed, and if a search was still running, keep waiting for it.
  const key = cacheKeyFor(stop, t);
  const have = set?.generatedAt ?? '';
  useEffect(() => {
    if (busy) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const since = pendingSince(trip.token, key);
    if (set && !since) return;
    const check = async () => {
      const got = await savedRecs(trip.token, key);
      if (!alive) return;
      if (got && got.generatedAt > have) { setPending(trip.token, key, false); setWaiting(false); onSave(got); return; }
      const s = pendingSince(trip.token, key);
      if (s) { setWaiting(true); timer = setTimeout(check, 5000); } else setWaiting(false);
    };
    void check();
    return () => { alive = false; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, have, busy]);

  async function run() {
    setBusy(true);
    setError(null);
    const r = await fetchRecs(trip, stop, t);
    setBusy(false);
    if (r.ok) onSave(r.set);
    else setError(r.message);
  }

  return (
    <section className="picks" aria-label={`Picked for travelers in ${stop.name}`}>
      <div className="section-h" style={{ margin: '0 0 12px' }}>
        <h3>Picked for {mine ? 'you' : t.name}</h3>
      </div>

      {trip.travelers.length > 1 && (
        <div className="who-tabs" role="tablist" aria-label="Whose picks">
          {trip.travelers.map(x => (
            <button key={x.id} role="tab" aria-selected={x.id === t.id} onClick={() => { setWho(x.id); setError(null); }}>
              {x.id === t.id ? `For ${x.name}` : x.name}
            </button>
          ))}
        </div>
      )}

      {!ready ? (
        <div className="rec-empty">
          <p>{mine ? 'Pick five interests and Passage will find things for you here.' : `${t.name} hasn’t picked their interests yet.`}</p>
          {mine && <button className="btn-line" onClick={onEditProfile}>Add your interests</button>}
        </div>
      ) : (
        <>
          <p className="loves">
            {t.profile!.interests.map(i => i.toLowerCase()).join(', ')}
            {mine && <button onClick={onEditProfile} aria-label="Edit your interests">Edit</button>}
          </p>

          {set && !busy && !waiting && (
            <>
              {isStale(set, t) && (
                <div className="scan-note warn"><Icon name="info" fill /><span>{mine ? 'Your' : `${t.name}’s`} interests changed since these were picked. Refresh for new ones.</span></div>
              )}
              {set.items.map((r, i) => (
                <article key={r.name} className="pick">
                  <span className="no" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4>{r.name}</h4>
                    <p>{r.why}</p>
                    <div className="row">
                      <span className="where">{r.distance} · {r.area}</span>
                      {r.klook ? (
                        <a className="kpill" href={withAid(r.klook.url)} target="_blank" rel="noopener noreferrer"
                          aria-label={`${r.name} on Klook${r.klook.price ? `, from ${r.klook.price}` : ''}`}>
                          {r.klook.was && r.klook.price && <s>{r.klook.was}</s>}
                          {r.klook.price ? `${r.klook.price} on Klook` : 'On Klook'}
                        </a>
                      ) : r.url && <a className="site" href={r.url} target="_blank" rel="noopener noreferrer">Website</a>}
                    </div>
                  </div>
                </article>
              ))}
            </>
          )}

          {(busy || waiting) && (
            <div className="rec-busy" role="status">
              <Icon name="progress_activity" className="spin" />
              <span>Looking around {stop.name} for {mine ? 'you' : t.name}… this can take up to a minute.</span>
            </div>
          )}
          {error && <div className="scan-note bad" role="alert" style={{ marginTop: 12 }}><Icon name="error" fill /><span>{error}</span></div>}

          {!busy && !waiting && (
            <button className={set ? 'btn-line' : 'btn-primary'} style={{ marginTop: 12 }} onClick={run}>
              {set ? 'Refresh picks' : `Find things for ${mine ? 'you' : t.name} in ${stop.name}`}
            </button>
          )}
          {set && !busy && !waiting && (
            <p className="credit">
              {researched(set.generatedAt)} from the web by Passage. Check before you go.
              {hasKlook && <><br />Klook prices as seen that day; they change.</>}
            </p>
          )}
        </>
      )}
    </section>
  );
}

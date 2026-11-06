import type { ScanContext } from '../lib/scan-prompt';
import { legLabel, sortedStops } from '../lib/trip';
import type { Trip } from '../lib/types';

export function scanContextFor(trip: Trip): ScanContext {
  return {
    tripName: trip.name,
    today: new Date().toISOString().slice(0, 10),
    stops: sortedStops(trip).map(s => ({ id: s.id, name: s.name, country: s.country, arrive: s.arrive, depart: s.depart })),
    legs: trip.legs.map(l => ({ id: l.id, label: legLabel(trip, l), mode: l.mode })),
  };
}

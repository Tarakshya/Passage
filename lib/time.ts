// Time-zone-correct helpers. Bookings are stored as local wall-clock time plus an IANA zone,
// because that is what a ticket says ("09:57, Wien Hbf"). These convert to real instants.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Offset of `tz` from UTC at `instant`, in minutes (Vienna in winter → +60). */
export function tzOffsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** "2026-11-04T09:57" in "Europe/Vienna" → the real instant. Handles DST transitions. */
export function zonedToInstant(local: string, tz: string): Date {
  const [d, t = '00:00'] = local.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, day, hh, mm);
  // Two passes converge across DST boundaries.
  let guess = naive - tzOffsetMinutes(new Date(naive), tz) * 60000;
  guess = naive - tzOffsetMinutes(new Date(guess), tz) * 60000;
  return new Date(guess);
}

/** The instant → local "YYYY-MM-DDTHH:mm" in `tz`. */
export function instantToZoned(instant: Date, tz: string): string {
  const shifted = new Date(instant.getTime() + tzOffsetMinutes(instant, tz) * 60000);
  return shifted.toISOString().slice(0, 16);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
}

export function todayIn(tz: string, now: Date = new Date()): string {
  return instantToZoned(now, tz).slice(0, 10);
}

/** "2026-07-22" → "Jul 22" */
export function fmtDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "2026-07-22" → "TUE · JUL 22" */
export function fmtDayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} · ${MONTHS[m - 1]} ${d}`.toUpperCase();
}

/** "JUL 22 – 24" or "JUL 30 – AUG 2" */
export function fmtRange(a: string, b: string): string {
  const [, ma, da] = a.split('-').map(Number);
  const [, mb, db] = b.split('-').map(Number);
  const right = ma === mb ? `${db}` : `${MONTHS[mb - 1]} ${db}`;
  return `${MONTHS[ma - 1]} ${da} – ${right}`.toUpperCase();
}

export function fmtTime(local: string): string {
  return local.slice(11, 16);
}

export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

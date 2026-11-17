'use client';

// A photo of a city for the top of its plans, from Wikipedia's page summary (free to use, credited
// with a link back). Remembered on the phone for a week, including "no good photo".

export interface CityPhoto { src: string; page: string }

const WEEK = 7 * 864e5;
const key = (name: string, country: string) => `passage:photo:${name.toLowerCase()}|${country}`;

interface Summary {
  type?: string; title?: string; description?: string; extract?: string;
  thumbnail?: { source: string; width: number }; originalimage?: { source: string; width: number };
  content_urls?: { mobile?: { page?: string }; desktop?: { page?: string } };
}

/** A big-enough version of the page's lead image, never wider than the original. */
function sized(s: Summary): string | null {
  const o = s.originalimage, t = s.thumbnail;
  if (!o && !t) return null;
  if (o && o.width <= 1400) return o.source;
  if (t && /\/\d+px-/.test(t.source)) return t.source.replace(/\/\d+px-/, '/1200px-');
  return o?.source ?? t?.source ?? null;
}

async function summary(title: string): Promise<Summary | null> {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { headers: { accept: 'application/json' } });
  return res.ok ? ((await res.json()) as Summary) : null;
}

export async function cityPhoto(name: string, country: string, countryLabel: string): Promise<CityPhoto | null> {
  const k = key(name, country);
  try {
    const hit = JSON.parse(localStorage.getItem(k) ?? 'null') as { at: number; photo: CityPhoto | null } | null;
    if (hit && Date.now() - hit.at < WEEK) return hit.photo;
  } catch { /* ignore */ }
  let photo: CityPhoto | null = null;
  try {
    // "Split" alone is a disambiguation page; "Split, Croatia" isn't. Only accept a page that is
    // about a place in the right country.
    for (const title of [name, `${name}, ${countryLabel}`]) {
      const s = await summary(title);
      if (!s || s.type === 'disambiguation') continue;
      const about = `${s.description ?? ''} ${s.extract ?? ''}`;
      if (!about.includes(countryLabel)) continue;
      const src = sized(s);
      if (src && /^https:\/\/upload\.wikimedia\.org\//.test(src)) {
        photo = { src, page: s.content_urls?.mobile?.page ?? s.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` };
        break;
      }
    }
  } catch { return null; } // offline: try again next time, don't remember
  try { localStorage.setItem(k, JSON.stringify({ at: Date.now(), photo })); } catch { /* ignore */ }
  return photo;
}

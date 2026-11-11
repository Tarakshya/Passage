# Passage: architecture and decisions

Each section covers one decision: what was chosen, what it was weighed against, and what it costs.

## 1. An installable web app, not a native app

The brief was "downloadable from a link". A web app with a manifest and service worker installs from
the URL with its own icon and full-screen launch, and needs no store review. The cost is
**no background location on iOS**, so the live tiles work while the app is open, not as push
alerts. That covers the real moment of use: you glance at the phone and see red. Push
notifications are parked for v2.

## 2. Claude: one route, forced strict tool calls

`/api/scan` is the only code that holds the API key. It reads two kinds of document, booking
confirmations and receipts, and each has its own tool schema (`lib/scan-prompt.ts`).

- **Forced tool choice plus `strict: true`.** The reply is always schema-valid JSON, never prose to
  parse. Every property is required and nullable, so "not on the document" is an explicit `null`,
  never a guess. Zod validates it again on the way out (`lib/schema.ts`), because a model
  boundary is still a trust boundary.
- **Confidence per field.** Each value comes back `high` or `low`. The form underlines the low ones
  and says "Check this — Claude wasn't sure". This is the difference between auto-fill that
  people trust and auto-fill they have to re-check entirely.
- **Trip context in the prompt.** Stop and leg ids with dates go in with the image, so Claude can
  file the booking under the right stop and settle DD/MM versus MM/DD dates against the trip's
  own dates. It may only return ids that appear in the context, and the client checks that again.
- **Prompt caching.** The system prompt and *both* tool schemas are identical on every call and sit
  before the cache breakpoint. Listing both tools, even though only one is forced, keeps one shared
  cached prefix for both kinds of scan.
- **Model: Claude Sonnet 5.5.** Dense, small-print confirmation screenshots reward accuracy more than
  a few hundred milliseconds. The model is one environment variable (`SCAN_MODEL`), so the eval
  can compare it against Haiku 5.5 on cost and accuracy.
- **Image prep on the phone.** Images are downscaled to 1568 px on the long edge as JPEG before
  upload. Claude reads at about that size anyway, so it costs nothing in accuracy and saves
  upload time, input tokens and Vercel's 4.5 MB body limit.
- **Guardrails.** 20 scans per trip per day (in Postgres, so it holds across serverless
  instances), a separate pool for the demo, a 20-second timeout, one retry. Every failure ends
  with the manual form open and a plain sentence, never a blank error.
- **Measured.** Each call logs latency, input/output tokens and cache reads as one JSON line,
  with no image or content stored. `npm run eval:scan` scores field accuracy on real documents;
  the launch bar is 95%.

## 2b. Recommendations: researched per traveler, per city

Each traveler picks five interests and can share one page they love. In any city, tapping
**Find things for you** calls `/api/recommend` (`lib/recommend-prompt.ts`):

- **Claude researches, not recalls.** It has Anthropic's server-side **web search** (max 4) to
  check that places exist, are open this season and are near the stay, and **web fetch** (max 1)
  to read the traveler's own link for taste. Because fetching happens on Anthropic's side, our
  server never requests a user-supplied URL, so there's no server-side request forgery to defend.
  Links are still checked to be http(s) on the way in.
- **Anchored on the itinerary.** The prompt carries the stay's name, address and coordinates, the
  dates, what's already booked (so it isn't repeated) and the next stop. Picks are kept within
  about 30 minutes, spread across interests (at most two per interest).
- **Structured output.** The final answer must match a JSON schema (`output_config.format`) and is
  validated again with zod. Links that aren't http(s) are dropped; the list is capped at five.
- **Long turns.** Server tools can pause a turn (`pause_turn`); the route continues it up to
  twice before giving up cleanly.
- **On tap, per traveler.** Nothing runs automatically. Results are saved for the whole group
  (`recs` keyed `stopId:travelerId`) and marked stale if that person later changes their interests.
- **Cost guardrails.** 15 runs per trip per day, a separate pool for the demo, and a log line per
  run with latency, tokens and search count. A run costs roughly $0.05–0.10, mostly search.

## 2c. Klook: shown only where it is real

T's rule: Klook for experiences, deals and prices, and for its trains, buses and ferries — and if
Klook doesn't have it, show nothing.

- **Experiences.** While researching picks, Claude may spend up to two searches checking whether
  Klook sells that exact ticket or tour. It returns a Klook address and "from" price only if it
  saw them in search results. The server then keeps the link only if it is an `https` page on
  `klook.com` (look-alike domains and the bare home page are dropped) and the price only if it
  looks like a price (`lib/klook.ts`). Nothing ever builds a Klook URL or price. Picks Klook
  doesn't sell show a plain "Website" link, or nothing.
- **Transport.** An unbooked *train* leg gets a Klook pill only when both ends are in countries
  Klook's Europe rail shop lists (GB, ES, IT, FR, NL, CH, DE). Klook doesn't publish bus or ferry
  coverage per route, so those legs get no pill rather than a hopeful one. The demo's Austria and
  Croatia legs therefore show none — by design.
- **No partner API.** Klook's full API needs a partner agreement. This works without one, and
  `NEXT_PUBLIC_KLOOK_AID` adds an affiliate id to links if one is ever granted.
- Prices are a snapshot, so the list says when it was researched and that Klook prices change.

## 3. Live status is pure, local and honest

`lib/live-status.ts` has no I/O. It takes a booking, "now", where you are and where you need to be:

```
leave-by = start − buffer − travel
buffer   = flight 120 · ferry 30 · train 15 · bus/activity/dinner 10 · hotel none (check-in is a window)
travel   = straight-line km × 1.3, walking under 2 km, city transit above
```

States are **on track** (more than 30 minutes to leave-by), **leave soon**, **at risk** (leave-by
passed) and **missed** (start passed). They are tracked from 24 hours before until 2 hours after.
The estimate is shown with a "~" because it is one. Without location permission the
engine runs in **time-only mode** and the tile says so, rather than pretending.

Bookings store **local wall-clock time plus an IANA zone**, because that is what a ticket says
("09:57, Wien Hbf"). `lib/time.ts` converts to instants with a two-pass offset that is correct
across DST changes; this is tested on both 2026 Vienna transition days.

**Design fix carried into code:** the handoff used amber for both *Pending* and *running late*.
Live state never reuses the booking-status colours. It is a strip, a ring and words.

## 4. Money is integers

Amounts are integer minor units. `splitEvenly` hands out the leftover cents so shares always add
up exactly (€58.00 / 3 = 19.34 + 19.33 + 19.33). Balances convert to the trip's base currency at
the daily ECB reference rate (via Frankfurter, cached 6 hours); the rate and its date are printed
under the balance. Offline, labelled estimates are used. Settle-up is greedy largest-first, which
is optimal for groups this size.

**Approval rule** (`editExpense`): if someone other than the admin changes the *amount* of a bill
Claude scanned, the change goes pending and balances keep the scanned amount until the admin
approves it. Titles and splits can be fixed by anyone.

## 5. Sharing without accounts

A trip's 128-bit random token is its only key. In Postgres, row-level security is on with **no
policies**, so the public key can't touch tables. All access goes through `security definer`
functions that take the token (`get_trip`, `apply_mutation`, `create_trip`, `take_scan`).

Each entity is stored as a validated JSON document per row. A trip is small and always loaded
whole, so this keeps `lib/types.ts` the single schema rather than two that drift. Reservations
and expenses are separate rows, so two people adding expenses at once never overwrite each other.

**Live sync:** after a write, the client sends a Realtime *broadcast* on `trip:<token>` and other
phones refetch. This works regardless of row-level security, and no data rides on the socket.

Profiles and recommendations have their own mutations (`upsertProfile`, `setRecs`), and a trip
edit (`replaceTrip`) never overwrites them, in the app's reducer or in SQL. That behaviour is
checked by `supabase/smoke-test.sql` against a real Postgres.

**Offline:** every change is one `Mutation` (`lib/mutations.ts`). It is applied to the screen at
once, appended to an outbox in local storage and sent in order; a network failure stops the queue
without losing it. The same reducer replays the outbox over the last cached copy while offline.

## 6. Small things that add up

- **Icons:** 50-odd Material Symbols generated into inline SVG (`scripts/build-icons.mjs`), about
  12 KB gzipped instead of a multi-megabyte icon font, with no flash of ligature text.
- **Fonts:** self-hosted via Fontsource, so there is no third-party request and they work offline.
- **City capsules:** each city in the itinerary is a compact capsule with a fixed street map of that
  city fading in from the right (lazy-loaded). Live bookings for today sit just below their city.
- **Maps:** the ticket carries a faint street map of the city you're in today (`mapStop` in
  `lib/trip.ts`): the first stop before the trip, the last after it, and on a travel day it
  switches once your first booking out has left. It is a static map made of the 2–6
  OpenStreetMap image tiles that cover the box (`components/MapView.tsx`). The first version
  used a full vector map engine: about 1 MB plus a background worker, slow on phones, for a map
  nobody pans. The static version needs no key, appears almost at once, and is cached offline.
  It follows the OSM tile policy: visible credit, a Referer, caching. Each city stub carries a fixed map of its own city. If tiles don't
  arrive, the plain card stays.
- **Place search:** Photon (OpenStreetMap). Time zones come from `tz-lookup` on the device, so a
  stop's zone never depends on a network call.
- **Security headers:** strict CSP limited to the hosts the app talks to, an origin-only referrer
  (OpenStreetMap needs one; trip tokens in paths are never sent), and
  `frame-ancestors 'none'`.
- **The demo** runs entirely on the device, always mid-trip (dates are relative to now), and
  re-seeds after 6 hours. Reviewers can't change it for each other.

## 7. The look: "Boarding Pass"

A night-navy app where the trip is a cream paper ticket with a tear-off stub, and one bright
lagoon colour does all the pointing. Rules that keep it from looking generated:

- **Three type voices, each with a job:** Instrument Serif for names and amounts, Hanken Grotesk
  for reading, IBM Plex Mono for data and labels.
- **Status is a word or a shape, never colour alone:** rubber stamps (solid = booked, dashed =
  to book), and red is reserved for one thing — at risk.
- **The home screen answers three questions in order:** where am I (greeting, with the city's
  temperature from Open-Meteo — keyless, city coordinates only, silently absent if it fails),
  what's next (`nextUp` in `lib/home.ts`: the soonest booking not yet missed, with a countdown to
  leave-by), and how is the trip going (the ticket: route codes, dates, crew, booked count).
- The greeting, route codes and countdown text are pure functions in `lib/home.ts`, tested.

## Known limits (v1)

- Travel times are estimates, not routing. Real routing is v2.
- Splits are equal splits only.
- Anyone with a trip link can edit it. That suits a private group, but it is not a permissions model.
- Scan accuracy is unproven until the eval set of 15 real documents is filled in.

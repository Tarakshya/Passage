# Passage

A shared trip planner for a small group on a multi-city trip. Your trip is a boarding pass: one route, one thing to do next.

- **One timeline** of every stop and how you travel between them, with what is still left to book.
- **Screenshot import.** Drop in a booking confirmation or a receipt and Claude fills in the form. You check it, then save.
- **Live leave-by times.** Every booking in the next 24 hours shows whether you will make it, worked out from the time, where you are and where the booking is.
- **Picked for you.** Each traveler chooses five interests and can share a page they love. In any city, Claude searches the web for a few things near where you're staying, made for that person. Where Klook really sells one of them, the pick shows Klook's price and link; where it doesn't, it shows nothing.
- **A shared split.** Anyone with the link logs what they paid. Balances are converted to one currency and settled in the fewest payments, and edits to scanned bills need the admin's approval.

It installs from a link (Add to Home Screen), has no accounts, and opens with no signal.

**Try it:** open `/t/demo` on a phone. The demo trip is always in progress, so tap **Demo** and move the clock to watch today's Belvedere tickets go from *on track* to *at risk*.

> Portfolio product by Tarakshya Mehrish. Design: "Boarding Pass". See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the decisions behind it.

## Run it locally

```bash
npm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY to try scanning
npm run dev                    # http://localhost:3000
```

Everything except scanning works with no keys at all. Trips are then stored on the one device.

## Deploy (about 20 minutes)

1. **Supabase** (free tier): create a project, open *SQL editor*, paste and run [`supabase/schema.sql`](supabase/schema.sql). Copy the project URL and the anon/publishable key from *Project settings → API*.
2. **Anthropic**: create an API key at console.anthropic.com and set a monthly spend limit.
3. **GitHub**: push this folder to a new repository.
4. **Vercel**: import the repository and add the three variables from `.env.example`. Deploy.

The share link for a trip is `https://<your-domain>/t/<token>`.

## Checks

```bash
npm test             # 50 unit tests: time zones, live status, balances, approvals, maps, scan + recommend routes
npm run typecheck
npm run build
npm run eval:scan    # scan accuracy against real documents, see evals/README.md
```

## Layout

```
app/                 routes: /t/[token] (the app), /api/scan + /api/recommend (Claude), /api/fx (rates)
components/          screens and sheets; icons.generated.ts from scripts/build-icons.mjs
lib/
  live-status.ts     the leave-by engine (pure, tested)
  balances.ts        integer-cent splits, currency conversion, settle-up (pure, tested)
  scan-prompt.ts     system prompt + strict tool schemas for reading bookings
  recommend-prompt.ts  web search + fetch tools, prompt and JSON schema for picks
  klook.ts             the rules for when a Klook link or price may be shown
  home.ts              greeting, route codes and "next up" for the home screen
  store.ts           LocalStore (demo) and SupabaseStore (shared, offline outbox)
  mutations.ts       every change to a trip, plus the scanned-bill approval rule
supabase/schema.sql  tables + token-keyed security-definer functions
supabase/smoke-test.sql  checks those functions against a real Postgres
evals/               scan eval cases and results
tests/               Vitest
```

# Passage

A calm, shared trip planner for a small group on a multi-city trip.

- **One timeline** of every stop and how you travel between them, with what is still left to book.
- **Screenshot import.** Drop in a booking confirmation or a receipt and Claude fills in the form. You check it, then save.
- **Live leave-by times.** Every booking in the next 24 hours shows whether you will make it, worked out from the time, where you are and where the booking is.
- **A shared split.** Anyone with the link logs what they paid. Balances are converted to one currency and settled in the fewest payments, and edits to scanned bills need the admin's approval.

It installs from a link (Add to Home Screen), has no accounts, and opens with no signal.

**Try it:** open `/t/demo` on a phone. The demo trip is always in progress, so tap **Demo** and move the clock to watch the train to Attnang-Puchheim go from *on track* to *at risk*.

> Portfolio product by Tarakshya Mehrish. Design: Passage "Direction 1a". See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the decisions behind it.

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
npm test             # 34 unit tests: time zones, live status, balances, approvals, scan route
npm run typecheck
npm run build
npm run eval:scan    # scan accuracy against real documents, see evals/README.md
```

## Layout

```
app/                 routes: /t/[token] (the app), /api/scan (Claude), /api/fx (exchange rates)
components/          screens and sheets; icons.generated.ts from scripts/build-icons.mjs
lib/
  live-status.ts     the leave-by engine (pure, tested)
  balances.ts        integer-cent splits, currency conversion, settle-up (pure, tested)
  scan-prompt.ts     system prompt + strict tool schemas for Claude
  store.ts           LocalStore (demo) and SupabaseStore (shared, offline outbox)
  mutations.ts       every change to a trip, plus the scanned-bill approval rule
supabase/schema.sql  tables + token-keyed security-definer functions
evals/               scan eval cases and results
tests/               Vitest
```

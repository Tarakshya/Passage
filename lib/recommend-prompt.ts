// Prompt, tools and output schema for /api/recommend. Server-only.
//
// Design notes (see docs/ARCHITECTURE.md):
//  • Claude researches with Anthropic's server-side web search, and reads the traveler's linked
//    page with server-side web fetch — so our server never fetches user-supplied URLs (no SSRF).
//  • The final answer is constrained by a JSON schema (structured outputs), then validated with zod.
//  • "Near the itinerary" is anchored on where they sleep: the stay's address and coordinates go
//    in the prompt, and distances come back as rough walking/transit times.

import type Anthropic from '@anthropic-ai/sdk';
import { REC_KINDS } from './schema';

export const RECS_MODEL = process.env.RECS_MODEL ?? 'claude-sonnet-5-5';

export const RECS_TOOLS: Anthropic.Messages.ToolUnion[] = [
  { type: 'web_search_20260318', name: 'web_search', max_uses: 4 },
  // Only ever used for the traveler's own link; capped to one read.
  { type: 'web_fetch_20260318', name: 'web_fetch', max_uses: 1, max_content_tokens: 6000 },
];

export const RECS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      // Count is enforced in the prompt and by zod; structured outputs keep array bounds simple.
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'kind', 'why', 'interest', 'area', 'distance', 'url'],
        properties: {
          name: { type: 'string', description: 'The place or experience, as it is known locally.' },
          kind: { type: 'string', enum: [...REC_KINDS] },
          why: { type: 'string', description: 'One sentence, under 25 words, tying it to this traveler — specific, not generic praise.' },
          interest: { type: 'string', description: 'Which of their five interests this serves, copied exactly.' },
          area: { type: 'string', description: 'Neighbourhood or street.' },
          distance: { type: 'string', description: 'Rough distance from where they are staying, e.g. "8 min walk", "15 min by tram".' },
          url: { type: ['string', 'null'], description: 'Official site or the page you found it on. Null if none.' },
        },
      },
    },
  },
} as const;

export const RECS_SYSTEM = `You are the local-knowledge side of Passage, a trip planner. You suggest a handful of things for ONE traveler to do in ONE city of their trip, based on what they love.

How to work:
- If the traveler gave a link, read it once with web_fetch to understand their taste (tone, price level, what they notice). Never follow other links from it.
- Use web_search to check that each place exists, is open in this season, and is where you think it is. Prefer recent, local sources.
- Stay near the itinerary: places within about 30 minutes of where they are staying, or on their way to the next stop.
- Return 5 picks (at least 3 if the city is small), spread across their interests — no more than two for one interest.
- Skip the obvious top-10 sights unless they clearly match; a reader of this list should feel it was made for them.
- Never invent a place, address or URL. If you can't verify something, leave it out.

Finish with only the JSON object the output format asks for.`;

export interface RecsContext {
  tripName: string;
  traveler: { name: string; interests: string[]; link: string | null };
  stop: { name: string; country: string; arrive: string; depart: string; lat: number; lng: number };
  stay: { name: string; address: string | null; lat: number | null; lng: number | null } | null;
  booked: string[]; // what's already planned here, so we don't repeat it
  nextStop: string | null;
}

export function recsUserText(c: RecsContext): string {
  const stay = c.stay
    ? `Staying at ${c.stay.name}${c.stay.address ? `, ${c.stay.address}` : ''}${c.stay.lat != null ? ` (${c.stay.lat.toFixed(4)}, ${c.stay.lng!.toFixed(4)})` : ''}.`
    : `No stay booked yet; use the city centre (${c.stop.lat.toFixed(4)}, ${c.stop.lng.toFixed(4)}).`;
  return [
    `Trip: ${c.tripName}. City: ${c.stop.name} (${c.stop.country}), ${c.stop.arrive} to ${c.stop.depart}.`,
    stay,
    c.booked.length ? `Already planned here: ${c.booked.join('; ')}. Don't repeat these.` : '',
    c.nextStop ? `Next stop after this: ${c.nextStop}.` : '',
    `Traveler: ${c.traveler.name}. Their five interests: ${c.traveler.interests.map(i => `"${i}"`).join(', ')}.`,
    c.traveler.link ? `A page they love (read it for their taste): ${c.traveler.link}` : 'They did not share a link.',
  ].filter(Boolean).join('\n');
}

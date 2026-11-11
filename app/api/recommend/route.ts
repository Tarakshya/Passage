// POST /api/recommend — five picks for one traveler in one city, from their interests and a page
// they like. Claude researches with server-side web search (and reads their link with web fetch),
// then answers in a fixed JSON shape. Body: RecsContext + { token }.

import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { takeQuota } from '@/lib/rate-limit';
import { RECS_MODEL, RECS_SCHEMA, RECS_SYSTEM, RECS_TOOLS, recsUserText } from '@/lib/recommend-prompt';
import { RecsResultSchema } from '@/lib/schema';
import { cleanKlookPrice, cleanKlookUrl } from '@/lib/klook';

export const runtime = 'nodejs';
export const maxDuration = 90;

const str = (max: number) => z.string().max(max);
const Body = z.object({
  token: str(64).min(4),
  tripName: str(120),
  traveler: z.object({
    name: str(60),
    interests: z.array(str(60)).min(1).max(5),
    link: z.string().url().max(500).refine(u => /^https?:\/\//.test(u), 'http(s) only').nullable(),
  }),
  stop: z.object({ name: str(80), country: str(2), arrive: str(10), depart: str(10), lat: z.number(), lng: z.number() }),
  stay: z.object({ name: str(120), address: str(200).nullable(), lat: z.number().nullable(), lng: z.number().nullable() }).nullable(),
  booked: z.array(str(160)).max(20),
  nextStop: str(80).nullable(),
});

const fail = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status });

/** Pull the JSON object out of the final text block (structured outputs make it the whole text). */
function finalJson(content: Anthropic.ContentBlock[]): unknown {
  const text = content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

export async function POST(req: Request) {
  const started = Date.now();
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, 'Recommendations are not set up on this server yet.');

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return fail(400, 'Something about this request was off. Try again.');
  }
  if (!(await takeQuota(body.token, 'recs'))) {
    return fail(429, "You've used today's recommendations for this trip. Try again tomorrow.");
  }

  const client = new Anthropic({ timeout: 75_000, maxRetries: 1 });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: recsUserText(body) }];
  try {
    let msg: Anthropic.Message | null = null;
    let searches = 0;
    // Server tools can pause a long turn; continue it (bounded) until Claude finishes.
    for (let round = 0; round < 3; round++) {
      msg = await client.messages.create({
        model: RECS_MODEL,
        max_tokens: 4000,
        system: [{ type: 'text', text: RECS_SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: RECS_TOOLS,
        output_config: { format: { type: 'json_schema', schema: RECS_SCHEMA } },
        messages,
      });
      searches += msg.usage.server_tool_use?.web_search_requests ?? 0;
      if (msg.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: msg.content });
    }
    const parsed = RecsResultSchema.safeParse(msg ? finalJson(msg.content) : null);

    console.log(JSON.stringify({
      event: 'recs', model: RECS_MODEL, ok: parsed.success, klook: parsed.success ? parsed.data.items.filter(i => cleanKlookUrl(i.klook_url)).length : 0, ms: Date.now() - started, searches,
      input_tokens: msg?.usage.input_tokens, output_tokens: msg?.usage.output_tokens, stop: msg?.stop_reason,
    }));

    if (!parsed.success) return fail(502, "Couldn't put together good picks this time. Try again in a minute.");
    // Keep only links that look like real web addresses, and Klook details only for real klook.com pages.
    const items = parsed.data.items.slice(0, 5).map(({ klook_url, klook_price, official_price, ...i }) => {
      const kUrl = cleanKlookUrl(klook_url);
      const price = kUrl ? cleanKlookPrice(klook_price) : null;
      return {
        ...i,
        url: i.url && /^https?:\/\//.test(i.url) ? i.url : null,
        klook: kUrl ? { url: kUrl, price, was: price ? cleanKlookPrice(official_price) : null } : null,
      };
    });
    return NextResponse.json({ ok: true, items, ms: Date.now() - started });
  } catch (err) {
    const timeout = err instanceof Anthropic.APIConnectionTimeoutError;
    console.error(JSON.stringify({ event: 'recs_error', ms: Date.now() - started, message: String(err) }));
    return fail(timeout ? 504 : 502, timeout ? 'That took too long. Try again in a minute.' : "Recommendations aren't available right now.");
  }
}

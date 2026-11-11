// POST /api/scan — read a booking confirmation or a receipt with Claude.
// The only place the Claude API key is used. Body: { token, kind, media: { type, data }, context }.

import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { takeScan } from '@/lib/rate-limit';
import { fromToolInput, BOOKING_TOOL, contextText, RECEIPT_TOOL, SCAN_MODEL, SYSTEM_PROMPT } from '@/lib/scan-prompt';
import { BookingScanSchema, ReceiptScanSchema } from '@/lib/schema';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BASE64 = 4_000_000; // ~3 MB file; Vercel caps request bodies at 4.5 MB

const Body = z.object({
  token: z.string().min(4).max(64),
  kind: z.enum(['booking', 'receipt']),
  media: z.object({
    type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']),
    data: z.string().max(MAX_BASE64),
  }),
  context: z.object({
    tripName: z.string().max(120),
    today: z.string().max(10),
    stops: z.array(z.object({ id: z.string(), name: z.string(), country: z.string(), arrive: z.string(), depart: z.string() })).max(40),
    legs: z.array(z.object({ id: z.string(), label: z.string(), mode: z.string() })).max(60),
  }),
});

const fail = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status });

export async function POST(req: Request) {
  const started = Date.now();
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, 'Scanning is not set up on this server yet. You can still enter it by hand.');

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return fail(400, 'That file is too large or unreadable. Try a screenshot instead.');
  }

  if (!(await takeScan(body.token))) {
    return fail(429, "You've used today's scans for this trip. Add this one by hand, or try again tomorrow.");
  }

  const tool = body.kind === 'booking' ? BOOKING_TOOL : RECEIPT_TOOL;
  const media: Anthropic.ContentBlockParam =
    body.media.type === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.media.data } }
      : { type: 'image', source: { type: 'base64', media_type: body.media.type, data: body.media.data } };

  const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  try {
    const msg = await client.messages.create({
      model: SCAN_MODEL,
      max_tokens: 1500,
      // Instructions + both tool schemas are identical on every call → cached prefix.
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [BOOKING_TOOL, RECEIPT_TOOL],
      tool_choice: { type: 'tool', name: tool.name, disable_parallel_tool_use: true },
      messages: [{
        role: 'user',
        content: [
          media,
          { type: 'text', text: `${contextText(body.context)}\n\nRead this ${body.kind === 'booking' ? 'booking' : 'receipt'} and record it with ${tool.name}.` },
        ],
      }],
    });

    const use = msg.content.find(b => b.type === 'tool_use');
    const schema = body.kind === 'booking' ? BookingScanSchema : ReceiptScanSchema;
    const parsed = schema.safeParse(fromToolInput(use && 'input' in use ? use.input : null, ['price', 'total']));

    console.log(JSON.stringify({
      event: 'scan', kind: body.kind, model: SCAN_MODEL, ok: parsed.success, ms: Date.now() - started,
      input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens,
      cache_read: msg.usage.cache_read_input_tokens ?? 0, cache_write: msg.usage.cache_creation_input_tokens ?? 0,
    }));

    if (!parsed.success) return fail(502, "I couldn't read that one. The form is open so you can enter it by hand.");
    return NextResponse.json({ ok: true, kind: body.kind, result: parsed.data, ms: Date.now() - started });
  } catch (err) {
    const timeout = err instanceof Anthropic.APIConnectionTimeoutError;
    console.error(JSON.stringify({ event: 'scan_error', kind: body.kind, ms: Date.now() - started, message: String(err) }));
    return fail(timeout ? 504 : 502, timeout
      ? 'That took too long. The form is open so you can enter it by hand.'
      : "Scanning isn't available right now. The form is open so you can enter it by hand.");
  }
}

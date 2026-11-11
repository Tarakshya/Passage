import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class APIConnectionTimeoutError extends Error {}
  class Anthropic { messages = { create }; static APIConnectionTimeoutError = APIConnectionTimeoutError; }
  return { default: Anthropic };
});

const { POST } = await import('../app/api/scan/route');
const { BOOKING_TOOL } = await import('../lib/scan-prompt');

const ctx = { tripName: 'Austria–Croatia', today: '2026-11-04', stops: [{ id: 'vie', name: 'Vienna', country: 'AT', arrive: '2026-11-02', depart: '2026-11-04' }], legs: [{ id: 'leg-vie-gmu', label: 'Vienna → Gmunden', mode: 'train' }] };
const req = (body: unknown) => new Request('http://x/api/scan', { method: 'POST', body: JSON.stringify(body) });
const body = (token = 'tok-' + Math.random()) => ({ token, kind: 'booking', media: { type: 'image/jpeg', data: 'AAAA' }, context: ctx });
const f = (value: unknown, confidence = 'high') => ({ value, confidence });
const booking = {
  isBooking: true, reason: null, type: f('train'), title: f('Wien Hbf → Attnang-Puchheim'),
  startLocal: f('2026-11-04T09:57'), startTz: f('Europe/Vienna', 'low'), endLocal: f('2026-11-04T12:50'), endTz: f('Europe/Vienna', 'low'),
  address: f('Wien Hauptbahnhof'), route: f('Wien Hbf → Attnang-Puchheim'), service: f('IC 548'), seat: f(null, 'low'),
  confirmation: f('0457 1893 2210'), price: f(96.4), currency: f('EUR'), cancelBy: f(null, 'low'),
  suggestedStopId: f(null, 'low'), suggestedLegId: f('leg-vie-gmu'),
};
const reply = (input: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(input) }], usage: { input_tokens: 1800, output_tokens: 300, cache_read_input_tokens: 1200, cache_creation_input_tokens: 0 } });

describe('/api/scan', () => {
  beforeEach(() => { create.mockReset(); process.env.ANTHROPIC_API_KEY = 'test'; delete process.env.NEXT_PUBLIC_SUPABASE_URL; vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });

  it('asks for the booking schema as structured output and caches the instructions', async () => {
    create.mockResolvedValue(reply(booking));
    const res = await POST(req(body()));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.result.service.value).toBe('IC 548');
    const args = create.mock.calls[0][0];
    expect(args.tool_choice).toBeUndefined(); // this model refuses forced tool use
    expect(args.tools).toBeUndefined();
    expect(args.output_config.format.type).toBe('json_schema');
    expect(args.output_config.format.schema.properties).toHaveProperty('suggestedStopId');
    expect(args.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(args.messages[0].content[0].type).toBe('image');
    expect(args.messages[0].content[1].text).toContain('leg leg-vie-gmu: Vienna → Gmunden');
  });

  it('sends PDFs as document blocks', async () => {
    create.mockResolvedValue(reply(booking));
    await POST(req({ ...body(), media: { type: 'application/pdf', data: 'JVBERi0=' } }));
    expect(create.mock.calls[0][0].messages[0].content[0].type).toBe('document');
  });

  it('rejects output that does not match the schema', async () => {
    create.mockResolvedValue(reply({ ...booking, type: f('spaceship') }));
    const res = await POST(req(body()));
    expect(res.status).toBe(502);
  });

  it('says so plainly when there is no API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(req(body()));
    expect(res.status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses oversized or malformed bodies before calling Claude', async () => {
    const res = await POST(req({ ...body(), media: { type: 'image/heic', data: 'x' } }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('enforces the daily quota per trip', async () => {
    create.mockResolvedValue(reply(booking));
    const b = body('quota-trip');
    for (let i = 0; i < 20; i++) expect((await POST(req(b))).status).toBe(200);
    expect((await POST(req(b))).status).toBe(429);
  });

  it('keeps the tool schema strict: every property required, no extras', () => {
    const s = BOOKING_TOOL.input_schema as unknown as { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
    expect(s.additionalProperties).toBe(false);
    expect(s.required.sort()).toEqual(Object.keys(s.properties).sort());
  });
});

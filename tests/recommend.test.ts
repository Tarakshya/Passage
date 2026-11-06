import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class APIConnectionTimeoutError extends Error {}
  class Anthropic { messages = { create }; static APIConnectionTimeoutError = APIConnectionTimeoutError; }
  return { default: Anthropic };
});

const { POST } = await import('../app/api/recommend/route');
const { cleanLink } = await import('../components/ProfileSheet');

const body = (over: Record<string, unknown> = {}) => ({
  token: 'tok-' + Math.random(), tripName: 'Austria–Croatia',
  traveler: { name: 'Priya', interests: ['Design shops', 'Vegetarian food', 'Live music', 'Photography', 'Markets'], link: 'https://example.com/my-favourite-essay' },
  stop: { name: 'Vienna', country: 'AT', arrive: '2026-11-06', depart: '2026-11-08', lat: 48.2082, lng: 16.3738 },
  stay: { name: 'Miiro Spittelberg', address: 'Kirchberggasse 6, 1070 Wien', lat: 48.2027, lng: 16.3563 },
  booked: ['Belvedere · Klimt galleries'], nextStop: 'Gmunden', ...over,
});
const req = (b: unknown) => new Request('http://x/api/recommend', { method: 'POST', body: JSON.stringify(b) });
const item = (name: string, interest = 'Markets') => ({ name, kind: 'food', why: 'Because.', interest, area: 'Neubau', distance: '8 min walk', url: 'https://example.org/' + name });
const reply = (text: string, stop = 'end_turn') => ({
  content: [{ type: 'server_tool_use', id: 's', name: 'web_search', input: {} }, { type: 'text', text }],
  stop_reason: stop, usage: { input_tokens: 9000, output_tokens: 700, server_tool_use: { web_search_requests: 3 } },
});

describe('/api/recommend', () => {
  beforeEach(() => { create.mockReset(); process.env.ANTHROPIC_API_KEY = 'test'; delete process.env.NEXT_PUBLIC_SUPABASE_URL; vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });

  it('uses web search + one fetch, a JSON schema, and the traveler context', async () => {
    create.mockResolvedValue(reply(JSON.stringify({ items: [item('Naschmarkt'), item('Song', 'Design shops'), item('Porgy & Bess', 'Live music')] })));
    const res = await POST(req(body()));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.items).toHaveLength(3);
    const args = create.mock.calls[0][0];
    expect(args.tools.map((t: { type: string }) => t.type)).toEqual(['web_search_20260318', 'web_fetch_20260318']);
    expect(args.tools[1].max_uses).toBe(1);
    expect(args.output_config.format.type).toBe('json_schema');
    const text = args.messages[0].content as string;
    expect(text).toContain('"Vegetarian food"');
    expect(text).toContain('https://example.com/my-favourite-essay');
    expect(text).toContain('Miiro Spittelberg');
    expect(text).toContain("Don't repeat these");
  });

  it('continues a paused turn (server tools) until Claude finishes', async () => {
    create.mockResolvedValueOnce(reply('', 'pause_turn')).mockResolvedValueOnce(reply(JSON.stringify({ items: [item('Naschmarkt')] })));
    const res = await POST(req(body()));
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].messages.at(-1).role).toBe('assistant');
  });

  it('drops non-web links and caps the list at five', async () => {
    const items = Array.from({ length: 6 }, (_, i) => item('Place ' + i));
    items[0].url = 'javascript:alert(1)';
    create.mockResolvedValue(reply(JSON.stringify({ items })));
    const json = await (await POST(req(body()))).json();
    expect(json.items).toHaveLength(5);
    expect(json.items[0].url).toBeNull();
  });

  it('fails cleanly on unusable output', async () => {
    create.mockResolvedValue(reply('Sorry, I could not find anything.'));
    expect((await POST(req(body()))).status).toBe(502);
  });

  it('rejects non-http links before calling Claude', async () => {
    const res = await POST(req(body({ traveler: { name: 'P', interests: ['x'], link: 'file:///etc/passwd' } })));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('enforces the daily quota per trip', async () => {
    create.mockResolvedValue(reply(JSON.stringify({ items: [item('A')] })));
    const b = body({ token: 'recs-quota' });
    for (let i = 0; i < 15; i++) expect((await POST(req(b))).status).toBe(200);
    expect((await POST(req(b))).status).toBe(429);
  });
});

describe('profile link', () => {
  it('normalises and validates', () => {
    expect(cleanLink('')).toBeNull();
    expect(cleanLink('example.com/essay')).toBe('https://example.com/essay');
    expect(cleanLink('http://blog.example.org')).toBe('http://blog.example.org/');
    expect(cleanLink('not a link')).toBe('invalid');
    expect(cleanLink('javascript:alert(1)')).toBe('invalid');
  });
});

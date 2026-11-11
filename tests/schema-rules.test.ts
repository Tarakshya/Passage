// The Claude API checks tool and output schemas before it reads anything. These tests check the
// same rules here, so a schema the API would reject fails in CI instead of on the live site.
import { describe, expect, it } from 'vitest';
import { RECS_SCHEMA } from '../lib/recommend-prompt';
import { BOOKING_TOOL, fromToolInput, RECEIPT_TOOL } from '../lib/scan-prompt';

type Node = Record<string, unknown>;
function walk(n: unknown, visit: (n: Node) => void) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { n.forEach(x => walk(x, visit)); return; }
  visit(n as Node);
  Object.values(n as Node).forEach(v => walk(v, visit));
}
const unions = (schemas: unknown[]) => {
  let count = 0;
  schemas.forEach(s => walk(s, n => { if (Array.isArray(n.type) || n.anyOf) count++; }));
  return count;
};

describe('schemas Claude will accept', () => {
  const all = [BOOKING_TOOL.input_schema, RECEIPT_TOOL.input_schema, RECS_SCHEMA];

  it('never puts an enum on a union type', () => {
    all.forEach(s => walk(s, n => { if (n.enum) expect(Array.isArray(n.type), JSON.stringify(n)).toBe(false); }));
  });

  it('keeps enum values the same type as the field', () => {
    all.forEach(s => walk(s, n => {
      if (n.enum && n.type === 'string') (n.enum as unknown[]).forEach(v => expect(typeof v).toBe('string'));
    }));
  });

  it('stays under the API limit of 16 nullable/union fields per request', () => {
    expect(unions([BOOKING_TOOL.input_schema, RECEIPT_TOOL.input_schema])).toBe(0); // both scan tools go in every scan request
    expect(unions([RECS_SCHEMA])).toBeLessThanOrEqual(16);
  });

  it('marks every property required and closes every object (strict mode)', () => {
    all.forEach(s => walk(s, n => {
      if (n.type === 'object' && n.properties) {
        expect(n.additionalProperties).toBe(false);
        expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as Node).sort());
      }
    }));
  });
});

describe('fromToolInput', () => {
  it('turns empty strings into null and amounts into numbers', () => {
    const out = fromToolInput({
      isBooking: true, reason: '',
      title: { value: 'Seehotel Schwan', confidence: 'high' },
      route: { value: '', confidence: 'low' },
      type: { value: 'hotel', confidence: 'high' },
      price: { value: '1,412.50', confidence: 'high' },
      currency: { value: '', confidence: 'low' },
    }, ['price']) as Record<string, { value: unknown }>;
    expect(out.reason).toBeNull();
    expect(out.title.value).toBe('Seehotel Schwan');
    expect(out.route.value).toBeNull();
    expect(out.price.value).toBe(1412.5);
    expect(out.currency.value).toBeNull();
    expect((fromToolInput({ total: { value: 'n/a', confidence: 'low' } }, ['total']) as Record<string, { value: unknown }>).total.value).toBeNull();
  });
});

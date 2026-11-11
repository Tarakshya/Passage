// Prompt and output schemas for /api/scan. Server-only.
//
// Design notes (see docs/ARCHITECTURE.md):
//  • Structured outputs (a JSON schema on the reply) mean it is always schema-valid JSON. The
//    schemas are kept as tool definitions because that is a convenient, typed home for them.
//  • Every field carries its own confidence, so the form can underline what to double-check.
//  • The instructions and tool schemas never change, so they sit before the cache breakpoint;
//    only the image and the trip context vary per request.

import type Anthropic from '@anthropic-ai/sdk';

export const SCAN_MODEL = process.env.SCAN_MODEL ?? 'claude-sonnet-5-5';

type JSONSchema = Record<string, unknown>;

// Strict tool schemas allow only a few "this or null" unions per request (and reject an enum on a
// union type), so nothing here is nullable: "not on the document" is an empty string, and
// numbers come back as text. fromToolInput() turns both back into nulls and numbers.
const text = (extra: JSONSchema = {}): JSONSchema => ({ type: 'string', ...extra });
const oneOf = (values: string[]): JSONSchema => ({ type: 'string', enum: [...values, ''] });
const amount = (): JSONSchema => ({ type: 'string', description: 'Digits with a dot for decimals, e.g. "412.50". Empty if not shown.' });
const field = (value: JSONSchema, description: string): JSONSchema => ({
  type: 'object',
  description,
  properties: { value, confidence: { type: 'string', enum: ['high', 'low'] } },
  required: ['value', 'confidence'],
  additionalProperties: false,
});
const obj = (properties: Record<string, JSONSchema>): Anthropic.Tool.InputSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const LOCAL = 'Local wall-clock time at that place, format YYYY-MM-DDTHH:mm, exactly as printed on the document.';
const CURRENCIES = ['EUR', 'INR', 'USD', 'GBP', 'HRK', 'CHF', 'JPY'];

export const BOOKING_TOOL: Anthropic.Tool = {
  name: 'record_booking',
  description: 'Record the fields of one travel booking read from a confirmation, ticket or itinerary.',
  strict: true,
  input_schema: obj({
    isBooking: { type: 'boolean', description: 'False if this is not a travel booking (a photo, a meme, a receipt).' },
    reason: text({ description: 'When isBooking is false: one short, friendly sentence saying what it looks like instead.' }),
    type: field(oneOf(['hotel', 'flight', 'train', 'ferry', 'bus', 'car', 'activity', 'dinner']), 'Kind of booking. A restaurant table is dinner; a tour, museum or show is activity.'),
    title: field(text(), 'Short name: the hotel or venue name; for transit "Origin → Destination" using city or station names.'),
    startLocal: field(text(), `Check-in or departure. ${LOCAL}`),
    startTz: field(text(), 'IANA time zone of the start place, e.g. Europe/Vienna. Infer from the city.'),
    endLocal: field(text(), `Check-out or arrival. ${LOCAL}`),
    endTz: field(text(), 'IANA time zone of the end place.'),
    address: field(text(), 'Street address of the hotel or venue, or the departure station/airport name.'),
    city: field(text(), 'City or town the booking is in, in English (for transit: the destination city), e.g. "Gmunden", "Vienna".'),
    route: field(text(), 'Transit only: "Origin station → Destination station" or "VIE → DBV".'),
    service: field(text(), 'Transit only: train, flight or ferry number, e.g. "IC 548", "OS 8291".'),
    seat: field(text(), 'Seat, coach, cabin or room type.'),
    confirmation: field(text(), 'Booking reference / confirmation / PNR, copied exactly.'),
    price: field(amount(), 'Total price paid, in major units (62.5 means 62.50).'),
    currency: field(oneOf(CURRENCIES), 'Currency of the price. Null if it is another currency.'),
    cancelBy: field(text(), `Free-cancellation deadline, if stated. ${LOCAL}`),
    suggestedStopId: field(text(), 'For hotels, activities, dinners: id of the trip stop this belongs to, from the trip context. Null if none fits.'),
    suggestedLegId: field(text(), 'For transit: id of the trip leg this travels, from the trip context. Null if none fits.'),
  }),
};

export const RECEIPT_TOOL: Anthropic.Tool = {
  name: 'record_receipt',
  description: 'Record the total of one receipt or bill.',
  strict: true,
  input_schema: obj({
    isReceipt: { type: 'boolean', description: 'False if this is not a receipt or bill.' },
    reason: text({ description: 'When isReceipt is false: one short, friendly sentence saying what it looks like instead.' }),
    merchant: field(text(), 'Shop, restaurant or company name, short.'),
    total: field(amount(), 'Final total paid including tax and tip, in major units.'),
    currency: field(oneOf(CURRENCIES), 'Currency of the total. Infer from symbols and the country.'),
    date: field(text(), 'Date on the receipt, YYYY-MM-DD.'),
    category: field(oneOf(['stay', 'transit', 'food', 'taxi', 'activity', 'other']), 'Best-fitting category.'),
  }),
};

export const SYSTEM_PROMPT = `You read travel documents for Passage, a trip planner, and record their fields in the JSON format you are given.

Rules:
- Copy what the document says. Never invent a value: if a field is not shown, its value is an empty string "".
- Confidence is "high" only when the value is printed clearly and unambiguously. Use "low" when you inferred it (for example a time zone from a city), the text is blurry or cut off, or two values compete.
- Times are local wall-clock times at that place, as printed. Do not convert time zones.
- Dates: documents may use DD/MM or MM/DD. Use the trip dates in the context to resolve ambiguous dates, and mark them low confidence.
- Match the booking to the trip using the stop and leg ids in the context. Only use ids that appear there.
- If the image is not the kind of document asked for, set isBooking / isReceipt to false, give a one-sentence reason, and leave every other value empty ("") with low confidence.`;

export interface ScanContext {
  tripName: string;
  today: string;
  stops: { id: string; name: string; country: string; arrive: string; depart: string }[];
  legs: { id: string; label: string; mode: string }[];
}

export function contextText(ctx: ScanContext): string {
  const stops = ctx.stops.map(s => `- stop ${s.id}: ${s.name} (${s.country}), ${s.arrive} to ${s.depart}`).join('\n');
  const legs = ctx.legs.map(l => `- leg ${l.id}: ${l.label} (planned ${l.mode})`).join('\n');
  return `Trip: ${ctx.tripName}. Today is ${ctx.today}.\nStops:\n${stops || '- none'}\nLegs:\n${legs || '- none'}`;
}

/** Tool output → the shape the app uses: "" becomes null, and amounts become numbers. */
export function fromToolInput(input: unknown, numeric: string[]): unknown {
  if (!input || typeof input !== 'object') return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (k === 'reason') { out[k] = typeof v === 'string' && v.trim() ? v : null; continue; }
    if (v && typeof v === 'object' && 'value' in v) {
      const f = v as { value: unknown; confidence: unknown };
      let value: unknown = typeof f.value === 'string' && f.value.trim() === '' ? null : f.value;
      if (numeric.includes(k) && typeof value === 'string') {
        const n = Number(value.replace(/[^\d.-]/g, ''));
        value = Number.isFinite(n) && /\d/.test(value) ? n : null;
      }
      out[k] = { value, confidence: f.confidence };
    } else out[k] = v;
  }
  return out;
}

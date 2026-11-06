// Prompt and output schemas for /api/scan. Server-only.
//
// Design notes (see docs/ARCHITECTURE.md):
//  • A forced, strict tool call means the reply is always schema-valid JSON — no parsing prose.
//  • Every field carries its own confidence, so the form can underline what to double-check.
//  • The instructions and tool schemas never change, so they sit before the cache breakpoint;
//    only the image and the trip context vary per request.

import type Anthropic from '@anthropic-ai/sdk';

export const SCAN_MODEL = process.env.SCAN_MODEL ?? 'claude-sonnet-5-5';

type JSONSchema = Record<string, unknown>;

const nullable = (t: string, extra: JSONSchema = {}): JSONSchema => ({ type: [t, 'null'], ...extra });
const nullableEnum = (values: string[]): JSONSchema => ({ type: ['string', 'null'], enum: [...values, null] });
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
    reason: nullable('string', { description: 'When isBooking is false: one short, friendly sentence saying what it looks like instead.' }),
    type: field(nullableEnum(['hotel', 'flight', 'train', 'ferry', 'bus', 'car', 'activity', 'dinner']), 'Kind of booking. A restaurant table is dinner; a tour, museum or show is activity.'),
    title: field(nullable('string'), 'Short name: the hotel or venue name; for transit "Origin → Destination" using city or station names.'),
    startLocal: field(nullable('string'), `Check-in or departure. ${LOCAL}`),
    startTz: field(nullable('string'), 'IANA time zone of the start place, e.g. Europe/Vienna. Infer from the city.'),
    endLocal: field(nullable('string'), `Check-out or arrival. ${LOCAL}`),
    endTz: field(nullable('string'), 'IANA time zone of the end place.'),
    address: field(nullable('string'), 'Street address of the hotel or venue, or the departure station/airport name.'),
    route: field(nullable('string'), 'Transit only: "Origin station → Destination station" or "VIE → DBV".'),
    service: field(nullable('string'), 'Transit only: train, flight or ferry number, e.g. "IC 548", "OS 8291".'),
    seat: field(nullable('string'), 'Seat, coach, cabin or room type.'),
    confirmation: field(nullable('string'), 'Booking reference / confirmation / PNR, copied exactly.'),
    price: field(nullable('number'), 'Total price paid, in major units (62.5 means 62.50).'),
    currency: field(nullableEnum(CURRENCIES), 'Currency of the price. Null if it is another currency.'),
    cancelBy: field(nullable('string'), `Free-cancellation deadline, if stated. ${LOCAL}`),
    suggestedStopId: field(nullable('string'), 'For hotels, activities, dinners: id of the trip stop this belongs to, from the trip context. Null if none fits.'),
    suggestedLegId: field(nullable('string'), 'For transit: id of the trip leg this travels, from the trip context. Null if none fits.'),
  }),
};

export const RECEIPT_TOOL: Anthropic.Tool = {
  name: 'record_receipt',
  description: 'Record the total of one receipt or bill.',
  strict: true,
  input_schema: obj({
    isReceipt: { type: 'boolean', description: 'False if this is not a receipt or bill.' },
    reason: nullable('string', { description: 'When isReceipt is false: one short, friendly sentence saying what it looks like instead.' }),
    merchant: field(nullable('string'), 'Shop, restaurant or company name, short.'),
    total: field(nullable('number'), 'Final total paid including tax and tip, in major units.'),
    currency: field(nullableEnum(CURRENCIES), 'Currency of the total. Infer from symbols and the country.'),
    date: field(nullable('string'), 'Date on the receipt, YYYY-MM-DD.'),
    category: field(nullableEnum(['stay', 'transit', 'food', 'taxi', 'activity', 'other']), 'Best-fitting category.'),
  }),
};

export const SYSTEM_PROMPT = `You read travel documents for Passage, a trip planner, and record their fields with the provided tool.

Rules:
- Copy what the document says. Never invent a value: if a field is not shown, its value is null.
- Confidence is "high" only when the value is printed clearly and unambiguously. Use "low" when you inferred it (for example a time zone from a city), the text is blurry or cut off, or two values compete.
- Times are local wall-clock times at that place, as printed. Do not convert time zones.
- Dates: documents may use DD/MM or MM/DD. Use the trip dates in the context to resolve ambiguous dates, and mark them low confidence.
- Match the booking to the trip using the stop and leg ids in the context. Only use ids that appear there.
- If the image is not the kind of document asked for, set isBooking / isReceipt to false, give a one-sentence reason, and leave every other value null with low confidence.`;

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

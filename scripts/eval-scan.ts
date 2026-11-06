// Scan eval: runs every confirmation in evals/cases through the same prompt and schema as
// /api/scan and scores each field against the expected answer.
//
//   evals/cases/<name>.png|jpg|pdf   the document (git-ignored: may hold personal data)
//   evals/cases/<name>.json          { "kind": "booking" | "receipt", "expected": { field: value } }
//
// Run: ANTHROPIC_API_KEY=… npm run eval:scan   → prints a table, writes evals/results-<date>.json

import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOOKING_TOOL, contextText, RECEIPT_TOOL, SCAN_MODEL, SYSTEM_PROMPT } from '../lib/scan-prompt';
import { buildDemoTrip } from '../lib/demo';
import { scanContextFor } from './eval-context';

const DIR = 'evals/cases';
const client = new Anthropic();
const norm = (v: unknown) => (typeof v === 'string' ? v.toLowerCase().replace(/\s+/g, ' ').trim() : v);

async function main() {
  const cases = readdirSync(DIR).filter(f => f.endsWith('.json'));
  if (!cases.length) { console.log(`No cases in ${DIR}. See evals/README.md.`); return; }
  const ctx = scanContextFor(buildDemoTrip());
  const rows: { name: string; correct: number; total: number; ms: number; misses: string[] }[] = [];

  for (const file of cases) {
    const name = file.replace(/\.json$/, '');
    const spec = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as { kind: 'booking' | 'receipt'; expected: Record<string, unknown> };
    const doc = ['png', 'jpg', 'jpeg', 'pdf'].map(ext => join(DIR, `${name}.${ext}`)).find(existsSync);
    if (!doc) { console.log(`skip ${name}: no document`); continue; }
    const data = readFileSync(doc).toString('base64');
    const media: Anthropic.ContentBlockParam = doc.endsWith('.pdf')
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: doc.endsWith('.png') ? 'image/png' : 'image/jpeg', data } };
    const tool = spec.kind === 'booking' ? BOOKING_TOOL : RECEIPT_TOOL;
    const t0 = Date.now();
    const msg = await client.messages.create({
      model: SCAN_MODEL, max_tokens: 1500,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [BOOKING_TOOL, RECEIPT_TOOL],
      tool_choice: { type: 'tool', name: tool.name, disable_parallel_tool_use: true },
      messages: [{ role: 'user', content: [media, { type: 'text', text: `${contextText(ctx)}\n\nRead this ${spec.kind} and record it with ${tool.name}.` }] }],
    });
    const out = (msg.content.find(b => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined)?.input as Record<string, { value: unknown }> | undefined;
    const misses: string[] = [];
    let correct = 0;
    for (const [k, want] of Object.entries(spec.expected)) {
      const got = out?.[k]?.value ?? null;
      if (norm(got) === norm(want)) correct++;
      else misses.push(`${k}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
    rows.push({ name, correct, total: Object.keys(spec.expected).length, ms: Date.now() - t0, misses });
    console.log(`${correct === Object.keys(spec.expected).length ? '✓' : '✗'} ${name}  ${correct}/${Object.keys(spec.expected).length}  ${Date.now() - t0} ms`);
    misses.forEach(m => console.log(`    ${m}`));
  }
  const c = rows.reduce((a, r) => a + r.correct, 0);
  const t = rows.reduce((a, r) => a + r.total, 0);
  const p90 = [...rows.map(r => r.ms)].sort((a, b) => a - b)[Math.floor(rows.length * 0.9)] ?? 0;
  console.log(`\nField accuracy ${((100 * c) / t).toFixed(1)}% (${c}/${t}) · p90 latency ${p90} ms · model ${SCAN_MODEL}`);
  writeFileSync(`evals/results-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ model: SCAN_MODEL, accuracy: c / t, p90, rows }, null, 2));
}

void main();

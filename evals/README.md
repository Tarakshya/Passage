# Scan eval

The launch bar is **95% of fields correct** across at least 15 real documents: flights, trains,
ferries, hotels and restaurant bills, in English and German.

Add a case as two files with the same name:

```
evals/cases/obb-train.png      ← the screenshot or PDF (git-ignored; blur personal details)
evals/cases/obb-train.json
```

```json
{
  "kind": "booking",
  "expected": {
    "type": "train",
    "service": "IC 548",
    "startLocal": "2026-07-24T09:57",
    "endLocal": "2026-07-24T12:50",
    "confirmation": "0457 1893 2210",
    "price": 96.4,
    "currency": "EUR"
  }
}
```

Only list the fields the document actually shows. Then run `ANTHROPIC_API_KEY=… npm run eval:scan`.
Results are written to `evals/results-<date>.json` and summarised in the case study.

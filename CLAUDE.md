# Working on Passage

Passage is a live portfolio app. Its production link is shared with recruiters, so it must never break.

## Release rule (set by the owner, T — not optional)

1. **Never commit or push directly to `main`.** `main` is what Vercel serves as the live app.
2. Every change goes on its own branch named `change/<short-description>`, pushed to GitHub.
   Vercel builds each branch as a **preview** with its own link.
3. Before handing over a preview, run `npm test`, `npm run typecheck` and `npm run build`; all must pass.
   Check the changed screens at phone width (390 px).
4. Give T the preview link and a plain-English summary of what changed and what to try.
5. **Stop and ask explicitly:** "Ready to make this live?" Only an explicit yes (e.g. "ship it", "yes, go live")
   counts. Silence, "looks good", or a request for more changes is not approval.
6. On approval: merge the branch into `main` and push. Confirm the live link updated, then delete the branch.
7. If a live release breaks something, revert `main` to the previous commit first, then fix on a branch.

## Orientation

- Read `README.md` and `docs/ARCHITECTURE.md` before changing anything.
- Product spec: the "Passage v1 — PRD" doc in T's Claude artifacts.
- The demo trip (`/t/demo`, `lib/demo.ts`) is what reviewers see first. Keep it working and always mid-trip.
- Icons: after using a new Material Symbols name, run `node scripts/build-icons.mjs`.
- Explain things to T in plain language; T is a product person, not an engineer.

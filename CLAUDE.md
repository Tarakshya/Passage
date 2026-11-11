# Working on Passage

Passage is a live portfolio app. Its production link is shared with recruiters, so it must never break.

## Release rule (set by the owner, T — not optional)

1. **Never commit or push directly to `main`.** `main` is what Vercel serves as the live app.
2. Every change goes on its own branch named `change/<short-description>`, pushed to GitHub.
   Vercel builds each branch as a **preview** with its own link.
3. Before handing over a preview, run `npm test`, `npm run typecheck` and `npm run build`; all must pass.
   Check the changed screens at phone width (390 px).
4. Also force-push the branch to `review`, so T's fixed review link
   (https://passage-git-review-tm-d751.vercel.app, and `/start` on it) always shows the newest
   version, including changes that are waiting for approval. T leaves Vercel toolbar comments
   there; read them with the Vercel connector (`list_toolbar_threads`, branch `review`) when T
   says "read my comments", and resolve each one once it is fixed.
   Give T a plain-English summary of what changed and what to try, and point to the review link.
5. **Stop and ask explicitly:** "Ready to make this live?" Only an explicit yes (e.g. "ship it", "yes, go live")
   counts. Silence, "looks good", or a request for more changes is not approval.
6. On approval: merge the branch into `main` and push. Confirm the live link updated (Vercel
   connector: latest production deployment READY on the new commit), then delete the branch.
   If `review` is behind `main` after a release, force-push `main` to `review` (add an empty
   commit if the SHA is identical, or Vercel skips the build).
7. If a live release breaks something, revert `main` to the previous commit first, then fix on a branch.

## Links T uses

- Live, sample trip: https://passage-cyan.vercel.app — for recruiters
- Live, clean start: https://passage-cyan.vercel.app/start — for anyone who wants to use it
- Review (newest version, T only): https://passage-git-review-tm-d751.vercel.app
- Vercel team id: team_mqpPGKUCSfNhBDzhQZwqUJDr, project: passage

## Orientation

- Read `README.md` and `docs/ARCHITECTURE.md` before changing anything.
- Product spec: the "Passage v1 — PRD" doc in T's Claude artifacts.
- The demo trip (`/t/demo`, `lib/demo.ts`) is what reviewers see first. Keep it working and always mid-trip.
- Icons: after using a new Material Symbols name, run `node scripts/build-icons.mjs`.
- Explain things to T in plain language; T is a product person, not an engineer.

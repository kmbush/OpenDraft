# OpenDraft — Backlog

Granular, in-flight and proposed work. The high-level phase narrative lives in
[`DESIGN.md §13`](DESIGN.md#13-phased-roadmap); this file is the running list of concrete items.

**Convention:** keep this current as we build — check off or remove shipped items and add newly
discovered work in the same change. Tags: `bug` · `feature` · `research` · `ambitious`.

---

## Bugs

*(none open — see "Recently shipped" below.)*

## Recently shipped

- [x] **Two more reveal shows** `feature` — the envelope flip wasn't exciting enough for the one moment the
  whole room watches together. Added **Split-Flap** (a departure board clattering, rows locking bottom-up
  until #1 tumbles alone) and **Plinko** (a puck per team bouncing down a peg field into its slot), plus an
  admin picker. Both are pure functions of elapsed time — Plinko's bounce is a precomputed deterministic
  path rather than a simulation, because physics can't be resumed and a board reconnecting mid-show has no
  state to resume from. No engine change: `REVEAL_GAMES` is a typed registry, so a missing show is a
  compile error.

- [x] **Board goes true fullscreen** `feature` — `F` or the header control puts the board on the whole
  display with no browser chrome, cursor and control fading once the room settles. A **screen wake lock**
  rides along, re-acquired on visibility change, so a board nobody touches doesn't screensave mid-draft.
  Entering on load is impossible — `requestFullscreen()` requires a user gesture — so the board carries its
  own control by necessity, not preference.

- [x] **Bare `/` was a dead end** `feature` — the base URL fell through to the station, which with no draft
  id hung on "Connecting…" forever. `/` now lands on the admin console, the one view that works from a cold
  start. Station keeps `/station` and the admin's `?draft=` links.
- [x] **State-aware loading** `feature` — one indefinite spinner covered every cause. Now `useConnectionPhase`
  separates *no-draft* · *connecting* · *not-found* · *stalled* · *reconnecting*, each with its own guidance,
  shared by board and station. The case worth naming: a **connected** socket that never delivers state is a
  wrong `?draft=` id, not a network problem — the old copy sent people to check their wifi.
- [x] **Pool date in the admin** `feature` — a stale pool and a fresh one both read "444 players". The setup
  screen now shows the snapshot id and its age, and warns past a week.
- [x] **R-7: transactional commit never integration-tested** `bug` — the version-guarded
  `TransactWriteCommand` was only exercised against in-memory fakes. Its integration suite was gated on
  `DYNAMODB_LOCAL_ENDPOINT` and had never run (no Docker/Java here), so 7 tests skipped silently on every
  green build. Now runnable against real DynamoDB via `DYNAMODB_TEST_REGION`, plus a genuinely concurrent
  race. Verified 8/8 against us-west-2.

- [x] **Player pool was frozen at commit time** `bug` — the pool shipped as a single hand-uploaded S3 object
  (`pools/bundled.json`, built 2026-07-05) and every draft defaulted to `poolSnapshotId: 'bundled'`, so
  refreshing it meant a code change. 61 of 444 players (14%) had gone stale — 6 rookies, plus veterans who
  changed teams. Now `publish:snapshot` uploads a dated, immutable `pools/<date>.json` and repoints
  `pools/latest.json`, which the admin resolves at draft creation. Refreshing is one command, no redeploy.

- [x] **Countdown circle stutters on the draft board** `bug` — the ring rode the 250ms `useTicker`
  re-render with a 0.25s CSS transition papering over the gap; when the main thread was busy the interval
  drifted, transitions restarted mid-flight, and the sweep lurched. Now driven by `useCountdownSweep`, a rAF
  loop writing `stroke-dashoffset` on a ref — no re-renders, still deadline-derived (AD-1). Measured under
  simulated main-thread contention: stalled frames 89% → 1%, velocity CV 2.91 → 0.34. (Idle browsers never
  reproduced it, which is why it read as intermittent.)
- [x] **Recent-picks count should scale with window size** `bug` — the rail was hard-coded to 8 picks. Now
  `useRowCapacity` measures the list box and its actual row height (ResizeObserver) and renders exactly the
  rows that fit. Verified: 8 rows @1366×768, 12 @1920×1080, 17 @2560×1440, with no row clipped at any size.

## Player pool

- [ ] **Refresh the pool from inside the app, not from a shell** `feature` — `publish:snapshot` moved the
  refresh off a code change, but it is still an operator running a CLI with AWS creds. Move it into the
  running system: an admin-gated API route that calls the same `fetchAndBuildSnapshot` → writes
  `pools/<date>.json` → repoints `pools/latest.json`, fronted by a **"Refresh player pool"** button in the
  admin console. Same pipeline, invoked by the app instead of a person. Then put a schedule on top
  (EventBridge → the same handler) so it stays current through preseason without anyone remembering;
  `DESIGN.md §6.2` already describes that form.
  *Constraints:* the build stays in `services/pool` so the rank-strip remains server-side (AD-6 — the pool
  must never reach a client with ranking intact); the Lambda needs internet egress and `s3:PutObject` on the
  pool bucket (Terraform grants only `GetObject` today); keep the never-overwrite-a-dated-object guard, since
  clients cache pools by id; keep the CLI as the break-glass path.
  *Done when:* an admin can refresh the pool from the console, a new draft picks it up, and no one has
  touched a shell or a deploy.

## Onboarding & connection UX

*(Surfaced by the "Connecting to the draft…" hang. The entry dead end and the blind spinner are fixed —
what remains is making a cold start resume on its own, without a `?draft=` link to carry the id.)*

- [ ] **Public role picker / entry** `feature` — for non-admin arrivals, offer a lightweight way to reach
  Board · Station · Resume rather than dropping everyone on the admin sign-in. Admins land in the hub;
  viewers get routed to board/station.

- [ ] **Active-draft pointer on the league doc** `feature` — persist the current draft id server-side so any
  device/origin auto-resumes without the `?draft=` / `localStorage` handoff. (localStorage is per-origin —
  this is why a new domain/device starts blank.)
- [ ] **Cache last draft state locally (IndexedDB)** `feature` — repaint the board instantly from cache on
  refresh/reconnect, then reconcile on `SYNC`. Serves the flaky-venue-wifi goal. (`lib/idb.ts` already
  caches the pool — extend the pattern.)

## Admin console → session hub

*(Items 2, 3, 5 cluster here — a single hub reframe rather than a single-draft-scoped console.)*

- [ ] **Reframe admin as a hub** `feature` — less "the current draft," more a home: create a draft (today's
  experience) **or** browse existing sessions. Umbrella for the items below.
- [ ] **Browse historical drafts** `feature` — list all past drafts, click into any, view and **export** it.
  Needs a new "list drafts for league" API route (currently only single-draft GET exists).
- [ ] **Completed drafts are read-only records** `feature` — once `COMPLETE`, a draft cannot be
  restarted/reopened; it remains a viewable/exportable historical record only.
- [ ] **Terminate / delete drafts** `feature` — terminate an **ongoing** draft (end it early) and delete a
  **historical** draft. Guard both with clear confirmation (destructive, admin-passcode gated).

## In-person event delight

- [ ] **Make the celebration effects physical** `feature` — `confetti.tsx` drops uniform squares and circles
  straight down a single CSS keyframe: same fall for every piece, no drift, no tumble, no depth. It reads as
  falling shapes rather than confetti, and it's the payoff on every pick and every reveal finale, so it's the
  most-seen animation in the app.
  *What's missing, roughly by payoff:* **tumble** (each piece rotating on its own axes, so it catches the eye
  edge-on then flat); **lateral drift and flutter** (paper doesn't fall vertically — a sine sway with
  per-piece phase is most of the effect); **depth** (a near/far split driving size, blur and fall speed);
  **varied shapes** (rectangular streamers and curled ribbons, not just squares); and **a real burst origin**
  — cannons firing up and outward from the lower corners, rather than everything starting at the top edge.
  *Constraint:* keep it derived from the piece index like the current one, so a reconnect or re-render never
  reshuffles a burst mid-show. Prefer transform/opacity so it composites instead of repainting — this lands
  next to the big-board performance item, and confetti during an announce beat is a suspect there.
  *Also worth doing:* team-coloured bursts (the drafting team's colour, not the fixed six), and a bigger,
  longer finale burst for the #1 reveal than for a routine pick.



- [ ] **QR join codes** `feature` — render the admin's `?draft=` board/station links as QR codes so players
  scan to open their station on a phone (fits the "extra clients may connect" model).
- [ ] **Audio + on-the-clock takeover** `feature` — chime on each pick, escalating tick as the timer runs
  low, a distinct sound when auto-pick fires; board shows a big "YOU'RE UP — team X."
- [ ] **Sound-effects system (event slots)** `feature` — a small registry mapping board events (pick made,
  on the clock, timer warning, auto-pick, reveal beats) to sound effects, with a toggle and swappable
  "packs" so a host can theme the room. Generalizes the on-the-clock cue above into pluggable slots; also
  the hook TTS/AI-mode narration plugs into.
- [ ] **Pick celebration ticker / "up next"** `feature` — brief flourish per pick (reuse `confetti.tsx` /
  reveal infra) and a preview of who's next.

## Platform & reach

- [ ] **Performance pass on the big board** `bug` — the countdown ring still reads choppy on a big screen,
  *after* the `useCountdownSweep` fix. That fix removed the React re-render from the sweep (rAF writing
  `stroke-dashoffset` on a ref, measured 89% → 1% stalled frames under simulated contention), so the
  remaining stutter is **not** re-renders and **not** a network call — the sweep makes neither. It needs
  measuring on the actual TV rather than another assumption.
  *Leading suspect:* animating `stroke-dashoffset` forces a **repaint of the ring's bounding box every
  frame** — it is not GPU-composited like `transform`/`opacity`. On a 4K panel that is a large area, 60×
  a second, on top of the board's gradients and vignette. Worth testing a transform-based ring (rotating a
  half-circle mask) or isolating the ring on its own layer.
  *Other things to rule out:* the 250ms `useTicker` re-rendering the whole board (a big DOM at 4K), the
  radial-gradient background and backdrop blurs repainting with it, confetti during announce beats, and
  whether the TV is actually driving 60Hz or the browser is throttling.
  *Hard constraint:* the countdown must stay **deadline-derived** (AD-1) — remote players read the same
  clock, and a fix that smooths the paint by drifting the time source would desync them and cost someone a
  pick. Change how it is painted, never where the time comes from.
  *Done when:* measured frame timings on the real display, before and after, with the deadline still the
  single source of truth.


- [ ] **PWA / installable shell** `feature` — the shared laptop opens instantly and survives wifi drops.
- [ ] **Mobile-polished station** `feature` — a player drafting from their seat: big search, position
  filters, one-tap confirm.

## AI mode (optional)

A cohesive, opt-in **"AI mode"** — ships **off by default**, gated by a single deployment toggle
(e.g. `var.enable_ai_mode` in Terraform, gating IAM + model access), and **never required** for the core
app to work. All items below share that constraint. **Guardrail:** keep AI output an *entertainment
overlay* — it must not leak value/ranking back into the drafting UI (the pool stays position + alpha, no
ADP — a hard invariant; see DESIGN/CONVENTIONS).

- [ ] **AI-powered per-team draft grades via Bedrock** `feature` `ambitious` — grade each team's draft after
  it completes. Slots into the existing Terraform behind the AI-mode toggle. No hard dependency on external
  AI for core flows.
- [ ] **Text-to-speech board narration** `feature` — have AI mode read board events aloud (pick
  announcements, "team X is on the clock", grades). Natural fit: **Amazon Polly** — cheap, low-latency, and
  purpose-built for TTS (simpler than an LLM for pure narration). Plugs into the sound-effects event slots.
- [ ] **Real-time "smack talk" / live analysis** `feature` `ambitious` — an optional AI commentator reacts
  to each pick (praise or roast) from the drafted player + roster needs + remaining pool. Hardest item:
  per-pick **latency + cost**, and **tone/safety guardrails** (configurable "spice", must stay
  good-natured). Combined with TTS this becomes an **"AI draft commentator" persona**. Strictly opt-in and
  isolated from the pick UI per the guardrail above.

## Multi-tenancy & auth

- [ ] **Research: robust auth + multi-tenancy scaffolding** `research` — assess what it takes to add
  stronger auth and formalize **1 league = 1 tenant, with multiple admins per tenant**. The schema is
  already tenant-ready (keys scoped by `LEAGUE#<id>`); this is the deferred SaaS direction in
  [`DESIGN.md §13` Phase 3](DESIGN.md#13-phased-roadmap) and the `AD-8` passcode→Cognito note. Output: a
  design pass on auth model, admin roles, tenant isolation, and migration path (no rewrite).

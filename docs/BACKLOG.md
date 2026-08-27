# OpenDraft — Backlog

Granular, in-flight and proposed work. The high-level phase narrative lives in
[`DESIGN.md §13`](DESIGN.md#13-phased-roadmap); this file is the running list of concrete items.

**Convention:** keep this current as we build — check off or remove shipped items and add newly
discovered work in the same change. Tags: `bug` · `feature` · `research` · `ambitious`.

---

## Bugs

*(none open — see "Recently shipped" below.)*

## Recently shipped

- [x] **Board re-rendered four times a second doing nothing** `bug` — `useTicker` sat at the top of
  `BoardView`, so every 250ms React re-rendered the picks rail, on-deck queue and hero, none of which depend
  on the time. The clock now ticks inside `CountdownRing` — the smallest subtree that needs it — on the
  second boundary rather than a free-running interval, and the board-level ticker only runs in phases that
  actually show a countdown. Measured at 4x CPU throttle over 5s: total main-thread 724ms → 639ms, style
  recalc 141ms → 107ms, script 254ms → 214ms.
  *Found while investigating the "choppy countdown ring", which turned out not to be a rendering problem at
  all — see "Mirroring-friendly board mode". Two hypotheses died on the way: `stroke-dashoffset` repaint
  (disabling the filters and gradients barely moved anything) and label jitter (250 divides 1000, so the
  flips were perfectly even — a test pins that).*

- [x] **Celebration effects are physical now** `feature` — confetti dropped uniform squares straight down one
  keyframe with a flat `rotate(720deg)`, which never presents an edge, so it read as spinning stickers. Pieces
  now **tumble on three axes** at deliberately unequal periods (so they turn edge-on and briefly vanish),
  **flutter** sideways on their own period, carry **depth** (near pieces bigger, faster, sharper; far ones
  hazed), come in **streamers and discs** as well as squares, and **launch from the lower corners** rather
  than falling from the top edge. Bursts take the drafting team's colour, and the reveal finale and the
  COMPLETE screen get bigger ones. Built as three nested transforms because travel, flutter and tumble have
  different periods — folding them into one keyframe is what made each piece read as a rigid object. All
  transform/opacity, so it composites rather than repaints.

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

- [ ] **Mirroring-friendly board mode** `feature` — the board is often put on the TV over **AirPlay**, which
  re-encodes the screen to H.264 at roughly 30fps over wifi. The browser renders perfectly (measured: 240Hz,
  zero dropped frames); the TV shows a resampled, recompressed version, which is what reads as choppy. The
  real answer is not to mirror — open the `?draft=` board URL directly on whatever drives the TV — so this
  item is for when mirroring is unavoidable.
  *What to change:* the ring's `drop-shadow` glow is a soft gradient on a **moving** edge, the worst case for
  mosquito noise; the `animate-breathe` 70vh blurred radial glow is a large slowly-shifting gradient that low
  bitrates smear; dark subtle gradients band. A mode with flatter fills, no animated blur and harder edges
  would look better over a stream while looking slightly plainer natively.
  *Pairs with:* **QR join codes** — scanning the board link onto the TV device is the fix that avoids all of
  this.



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

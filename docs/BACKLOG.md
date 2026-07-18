# OpenDraft — Backlog

Granular, in-flight and proposed work. The high-level phase narrative lives in
[`DESIGN.md §13`](DESIGN.md#13-phased-roadmap); this file is the running list of concrete items.

**Convention:** keep this current as we build — check off or remove shipped items and add newly
discovered work in the same change. Tags: `bug` · `feature` · `research` · `ambitious`.

---

## Bugs

- [ ] **Countdown circle stutters on the draft board** `bug` — the on-the-clock timer ring animates
  choppily at times; it should sweep smoothly. Likely a re-render/rAF or SVG stroke-dash cadence issue in
  `BoardView`, not the clock math. Target: buttery countdown on the big screen.

## Onboarding & connection UX

*(Surfaced by the "Connecting to the draft…" hang — the app assumes you already know your way in.)*

- [ ] **Default URL → admin console (with auth)** `feature` — hitting the base URL (whatever the installer's
  domain — e.g. `draft.example.com`, or the default `*.cloudfront.net`) should land on the **admin
  console and prompt authentication by default**, instead of the station view. Bare `/` currently falls
  through to station and hangs when no draft id is known. This is a client-route default change served
  through CloudFront (the SPA `default_root_object` stays `index.html`) — it tracks whatever domain the
  installer already configured, so no extra per-deploy config. Board/station stay reachable at their
  explicit paths and shared `?draft=` links.
- [ ] **Public role picker / entry (secondary to the above)** `feature` — for non-admin arrivals, offer a
  lightweight way to reach Board · Station · Resume (e.g. a picker or per-role links) rather than a dead end.
  Pairs with "Default URL → admin console": admins land in the hub; viewers get routed to board/station.
- [ ] **State-aware loading** `feature` — replace the infinite "Connecting…" with distinct states:
  *connecting* (with a timeout → guidance), *connected-but-no-draft*, *reconnecting*, *error*.
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

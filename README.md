# OpenDraft

**Open-source draft tool for in-person fantasy football leagues.** Run your league's annual draft in the
room — on the big screen and on laptops at the table — self-hosted on AWS. Modeled loosely on Sleeper's
conventions.

> Status: **Design / kickoff.** No application code yet. Architecture is defined in
> [`docs/DESIGN.md`](docs/DESIGN.md); coding standards in [`CONVENTIONS.md`](CONVENTIONS.md).

## What it does

- **Draft setup** — configure teams, roster format (QB/RB/WR/TE/FLEX/K/DEF/bench), rounds, snake vs. linear,
  and pick-timer length. Pick the draft order manually or with an animated randomizer game.
- **Live draft, two screens**
  - **Player station** (laptop): your roster-so-far and every available player, listed **only by position +
    alphabetically — never by ADP or draft value** (deliberate: the tool must not influence your picks).
  - **Draft board** (TV): who's on the clock, the round, recent picks, and a shared countdown, with a
    "the pick is in" moment on every selection.
- **Post-draft** — view the full board and export a themeable PDF.

## Design principles baked in

- **Runs on flaky venue wifi** — the player pool is cached locally; screens re-sync fully on reconnect.
- **Server-authoritative clock** — every screen shows the same deadline.
- **Near-zero idle cost** — serverless; you pay pennies for the days you actually draft.
- **Tenant-ready** — designed so a future hosted multi-tenant SaaS can be layered on without a rewrite.

## Stack (see `docs/DESIGN.md` for rationale)

React 19 + TypeScript + Tailwind v4 (Vite) frontend · TypeScript Lambdas · API Gateway WebSocket + HTTP ·
DynamoDB · S3 + CloudFront · Terraform. Player pool sourced from the public Sleeper API and snapshotted for
offline use.

## Repository layout

```
apps/web/          React app: /station /board /admin /export
services/engine/   Pure draft state machine (shared client + server)
services/api/      Lambda handlers (WebSocket + HTTP)
services/pool/     Sleeper snapshot builder + fallback
packages/shared/   Shared types & message contracts
infra/             Terraform
docs/DESIGN.md     Architecture & decisions
CONVENTIONS.md     Coding standards
```

## Status & roadmap

MVP (a working end-to-end draft) → polish (randomizer + "pick is in" animations, theming, PDF) → deferred
SaaS. Full phase breakdown in [`docs/DESIGN.md`](docs/DESIGN.md#13-phased-roadmap).

## License

TBD (open source).

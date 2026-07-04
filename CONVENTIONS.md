# OpenDraft — Conventions

Coding standards, structure, and the patterns every agent and contributor follows. Read this before
writing code. Architecture rationale lives in [`docs/DESIGN.md`](docs/DESIGN.md); this file is the *how*.

---

## 1. Project structure (monorepo)

```
opendraft/
├── apps/
│   └── web/                 # React 19 + Vite app: /station /board /admin /export
├── services/
│   ├── api/                 # Lambda handlers (WS + HTTP) — thin adapters only
│   ├── engine/              # PURE draft state machine — no I/O, no AWS imports
│   └── pool/                # Sleeper fetch + snapshot builder (+ bundled fallback)
├── packages/
│   └── shared/              # TS types + WS/HTTP message contracts (single source of truth)
├── infra/                   # Terraform (modules per resource group)
├── docs/
│   └── DESIGN.md
├── CONVENTIONS.md
└── README.md
```

**Dependency direction (must not be violated):**

```
apps/web  ─┬─▶ packages/shared
           └─▶ services/engine        (client-side validation / optimistic UI)
services/api ─┬─▶ packages/shared
              └─▶ services/engine      (server authority)
services/engine ─▶ packages/shared      (types only)
services/pool ─▶ packages/shared
```

- `services/engine` imports **nothing** but `packages/shared`. No `aws-sdk`, no `fetch`, no `Date.now()` in
  reducers (time is passed in as an argument). This is what makes it testable and reusable.
- Nothing imports from `apps/web`.

---

## 2. Language & tooling

- **TypeScript everywhere**, `strict: true`. No `any` — use `unknown` + narrowing, or a real type.
- **Biome** for lint + format (frontend and all TS). One config at root. No ESLint/Prettier.
- **Vitest** for unit tests, colocated as `*.test.ts` next to the code.
- **Node 20+** runtime for Lambdas; ESM modules.
- Package manager: **pnpm** workspaces (single lockfile at root).

---

## 3. Naming

| Thing | Convention | Example |
|---|---|---|
| Files (TS modules) | kebab-case | `draft-engine.ts`, `pick-flow.ts` |
| React components | PascalCase file + export | `DraftBoard.tsx` → `export function DraftBoard()` |
| Types / interfaces | PascalCase, no `I` prefix | `DraftState`, `PickEvent` |
| Functions / vars | camelCase | `slotForOverallPick` |
| Constants | UPPER_SNAKE | `DEFAULT_TIMER_SEC` |
| WS message types | UPPER_SNAKE string literals | `"SUBMIT_PICK"`, `"PICK_MADE"`, `"SYNC"` |
| DynamoDB keys | prefixed uppercase | `LEAGUE#`, `DRAFT#`, `PICK#`, `CONN#` |
| Terraform resources | snake_case | `aws_dynamodb_table.draft` |
| S3 pool objects | `pools/<snapshotId>.json` | `pools/2026-07-03.json` |

- IDs are opaque strings (ULID/UUID). Overall pick numbers are zero-padded in the SK (`PICK#0007`) so range
  queries sort correctly.

---

## 4. Patterns in use

### 4.1 State management (frontend)
- **Zustand** holds the mirrored live draft state; the **server is the source of truth**. The WS client is
  the *only* thing that writes server-derived slices into the store.
- **TanStack Query** owns setup/config data (league/draft/teams/theme) over the HTTP API — not Zustand.
- **Player pool** lives outside both: fetched once, kept in memory + IndexedDB, filtered locally.
- Optimistic UI is allowed for `SUBMIT_PICK` (add the player immediately) **but** must reconcile on the
  server `PICK_MADE`/`REJECT`. Never treat an optimistic pick as final.

### 4.2 The draft engine (authority)
- Shape: `reduce(state: DraftState, event: DraftEvent, ctx: { now: number }) => { state: DraftState, outbox: OutboundMessage[] }`.
- **Pure and deterministic.** All time/randomness enters via `ctx` or the event payload, never read inside.
- Ordering helpers (`slotForOverallPick`, snake/linear) live here and are the **only** implementation —
  client and server both import them. Never reimplement ordering in a component or handler.

### 4.3 Server handlers (`services/api`)
- Handlers are **thin adapters**: parse/authorize → load state from DynamoDB → `engine.reduce(...)` →
  persist (conditional write on `version`) → fan out `outbox` to connections → ack sender.
- **No business rules in handlers.** If you're tempted to branch on draft logic in a handler, it belongs in
  the engine.
- Pick application is a **conditional write** guarded by `version` (optimistic concurrency). On
  `ConditionalCheckFailed`, return `REJECT{ currentVersion }` — never retry blindly.

### 4.4 API design
- **REST (HTTP API)** for setup/config CRUD: nouns, standard verbs, JSON. `POST /leagues/{id}/drafts`, etc.
- **WebSocket** for the live draft: message envelope `{ type, draftId, payload, version? }`. `type` is an
  UPPER_SNAKE literal defined once in `packages/shared`.
- **Contracts live in `packages/shared`** and are imported by both ends. Do not hand-write a message shape
  in a component or handler — reference the shared type.
- Every client, on connect, sends `SYNC` and rebuilds from the returned full snapshot (§5.5 of DESIGN).

### 4.5 Error handling
- **Server:** never throw raw AWS errors to the client. Map to a typed result: `{ ok: true, ... }` or
  `{ ok: false, code, message }`. `ConditionalCheckFailed` → `REJECT`, not a 500.
- **Client:** transport errors and `REJECT`s roll back optimistic state and surface a non-blocking notice on
  the station; the board degrades to the last known snapshot and re-`SYNC`s on reconnect.
- Log with structured JSON to CloudWatch (`{ level, event, draftId, connectionId, ... }`). No `console.log`
  of secrets or full player payloads.

### 4.6 Configuration & secrets
- No secrets in code or the bundle. Passcode **hash** and HMAC key live in **SSM Parameter Store**; Lambdas
  read them at cold start. Client config (API URLs, pool URL) is injected at build/deploy via env, never
  hard-coded.

### 4.7 Theming
- All color/spacing that varies by league flows through **CSS custom properties** set from the theme object;
  Tailwind v4 tokens read those variables. Never hard-code a league's brand color in a component.

---

## 5. The ordering invariant (non-negotiable)

**Available players are ordered ONLY by `(position, last_name, first_name)`. Never by ADP / draft value.**

- Enforced at the **data layer**: the snapshot builder **strips** `search_rank`, `depth_chart_order`, and
  every ranking/ADP-like field, and emits players pre-sorted. The ranking data is **never shipped**, so no
  UI or devtools path can resurface it.
- A **unit test** asserts (a) none of the banned fields exist in the built snapshot and (b) the sort order is
  correct. This test is part of "done" for anything touching the pool.
- In the UI, do not add "sort by projected value / ADP / rank" controls. Position + alphabetical only.

---

## 6. Testing

- **Engine:** exhaustive unit tests — snake vs. linear across rounds, undo/redo of pointer & pool, waiting
  period, reconnection snapshot, boundary picks (first/last overall). The engine's purity makes this cheap;
  aim for high coverage here specifically.
- **Snapshot builder:** the ordering-invariant test above; schema-normalization on a fixture of Sleeper's
  shape.
- **Handlers:** integration-tested against DynamoDB Local; assert conditional-write rejection on stale
  `version`.
- Prefer testing the pure engine over mocking AWS. If a test needs heavy AWS mocking, the logic probably
  belongs in the engine.

---

## 7. Tenancy discipline (build-now, don't break later)

- **Every** DynamoDB item is keyed by `LEAGUE#<leagueId>` today, even though there is one league. Never
  write an item without a league scope "because there's only one."
- All data access is scoped by league id — no unscoped scans. This is what keeps multi-tenant an overlay
  rather than a migration (DESIGN §10).
- Keep auth at the **edge/handler** boundary; the engine and data layer stay tenant-agnostic.

---

## 8. Infrastructure (Terraform)

- Terraform only — no click-ops, no CDK. Modules grouped by concern (`dynamodb`, `s3-cloudfront`,
  `apigw-ws`, `apigw-http`, `lambda`, `iam`, `ssm`).
- **Least-privilege IAM per Lambda** — scope to its table, its S3 prefix, its params. No wildcard `*`
  resource roles.
- S3 buckets are **private**, reached only via CloudFront OAC. HTTPS/WSS only.
- State backend and environments (`dev`, later `prod`/tenants) parameterized, not copy-pasted.

---

## 9. Git & commits

- Conventional-commit-ish prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `infra:`.
- Branch off `main`; PRs reference the DESIGN decision (`AD-n`) they implement when relevant.
- Keep `docs/DESIGN.md` living: if a decision changes, update the AD entry (chosen/rejected/why) in the same
  PR — don't let the doc drift.

---

## 10. Anti-patterns — what NOT to do

- **Do NOT** order, rank, or hint player draft value anywhere (see §5). No ADP, no projections, no "top
  available."
- **Do NOT** put draft/business logic in Lambda handlers or React components — it goes in `services/engine`.
- **Do NOT** reimplement snake/linear ordering anywhere but the engine.
- **Do NOT** import `aws-sdk`, `fetch`, or read `Date.now()`/`Math.random()` inside `services/engine`. Time
  and randomness are inputs.
- **Do NOT** store the player pool in DynamoDB — it's an S3 snapshot + client cache.
- **Do NOT** make the server tick the clock per second. The server owns the **deadline timestamp**; clients
  render the countdown (DESIGN AD-1).
- **Do NOT** apply a pick without the `version` conditional write. No last-write-wins.
- **Do NOT** write a DynamoDB item without a `LEAGUE#` scope, even with one league.
- **Do NOT** add Cognito / user accounts for the self-hosted build — passcode + HMAC only until the SaaS
  stage (DESIGN AD-8).
- **Do NOT** hand-duplicate message shapes — import them from `packages/shared`.
- **Do NOT** hard-code a league's brand color, logo, or name — it's theme data.
- **Do NOT** rely on the network mid-draft where a cache would do — the pool must survive wifi loss.
- **Do NOT** introduce a relational database without an explicit decision in DESIGN (default is DynamoDB).

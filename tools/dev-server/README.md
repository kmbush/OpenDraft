# OpenDraft local dev harness (no AWS)

A tiny Node server that runs the whole draft on `localhost` with **no AWS**. It
reuses the `services/api` **core** (`dispatchAction`, `sendSync`,
`onConnect/onDisconnect`, `onTimerFire`, `handleHttp`) behind in-memory adapters
that implement the same ports the Lambda handlers use — so `apps/web` talks to it
unchanged. This doubly validates the ports/adapters design.

| Port | Adapter |
|---|---|
| Persistence | in-memory map (optimistic `version` guard intact) |
| Broadcaster | real `ws` sockets tracked in-process |
| Scheduler | `setTimeout` — so **timer-expiry auto-picks actually fire locally** |
| PoolLoader | the bundled snapshot at `services/pool/data/bundled-snapshot.json` |
| Secrets | dev passcode + a random HMAC key |

## Run

From the repo root:

```sh
pnpm install
pnpm --filter @opendraft/pool build:snapshot   # once, if data/bundled-snapshot.json is missing
pnpm dev                                        # starts harness (:8787) + Vite (:5173)
```

- App: <http://localhost:5173/admin> → <http://localhost:5173/board> → <http://localhost:5173/station>
- **Admin passcode: `draft2026`** (printed on boot)
- Vite proxies `/api`, `/ws`, and `/pool` to the harness on `:8787`.

## Try a draft
1. `/admin` → sign in with the passcode → **Create draft** (set a **Pool snapshot
   id**, e.g. `bundled` — the harness serves the bundled pool for any id; this is
   what enables auto-pick).
2. In Controls: **Randomize** the order → **Start**.
3. Open `/station` (same `?draft=<id>` is stored in localStorage) and draft players;
   watch `/board` update live with the countdown.
4. Let a clock run out → a **legal random auto-pick** fires. Use **Undo** to roll back.

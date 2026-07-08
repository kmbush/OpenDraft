# Contributing to OpenDraft

Thanks for your interest in OpenDraft! This is an open-source, self-hosted fantasy-football draft tool.
Contributions — bug reports, fixes, features, docs — are welcome.

## Ground rules

- **Coding standards live in [`CONVENTIONS.md`](CONVENTIONS.md).** Read it before writing code — it covers
  the monorepo layout, the ports-and-adapters split, the naming rules, and the hard invariants (e.g. the
  pool is **never** ordered by rank/ADP, draft logic lives only in `services/engine`).
- **Architecture rationale lives in [`docs/DESIGN.md`](docs/DESIGN.md).** If a change alters a documented
  decision (an `AD-n`), update that entry in the same PR so the doc never drifts.
- Be respectful — see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Development setup

You need **Node 20+** and **pnpm 9+**. Everything runs locally with no AWS:

```sh
pnpm install
pnpm --filter @opendraft/pool build:snapshot   # once, if the bundled snapshot is missing
pnpm dev                                        # harness (:8787) + Vite (:5173)
```

Then open <http://localhost:5173/admin> (dev passcode `draft2026`). See
[`tools/dev-server/README.md`](tools/dev-server/README.md) for the full walkthrough.

## Before you open a PR

Run the full local gate — CI runs exactly these and a red check blocks merge:

```sh
pnpm run check      # Biome lint + format
pnpm -r typecheck   # TypeScript, strict
pnpm -r test        # Vitest across every package
```

- **Add tests** for behavior changes. The draft engine is pure and deterministic — test it directly rather
  than mocking AWS. Anything touching the player pool must keep the ordering-invariant test green.
- Keep changes **small and focused**. One concern per PR is easier to review than a sweeping change.

## Pull request workflow

1. **Fork** the repo and create a branch off `main` (`feat/…`, `fix/…`, `docs/…`).
2. Make your change; keep commits [conventional-commit-ish](CONVENTIONS.md#9-git--commits)
   (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `infra:`).
3. Ensure the three commands above pass locally.
4. Open a PR against `main` with a clear description of **what** changed and **why**. Reference the DESIGN
   decision (`AD-n`) or issue it addresses when relevant.

## Reporting bugs & requesting features

Use the GitHub issue templates. For anything security-related, **do not** open a public issue — follow
[`SECURITY.md`](SECURITY.md) instead.

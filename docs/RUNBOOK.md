# OpenDraft — Operator Runbook

The recurring operational jobs, in the order you are likely to need them. For what the system *is*, see
[`DESIGN.md`](DESIGN.md); for standing it up the first time, [`../infra/README.md`](../infra/README.md);
for running the event itself, [`RUNNING-A-DRAFT.md`](RUNNING-A-DRAFT.md).

Every command reads its values from `terraform output`, so nothing here is specific to one deployment.
Run them from the repo root unless a step says otherwise, with AWS credentials that can reach your stack
(`aws sts get-caller-identity` should name the account your `infra/terraform.tfstate` was applied to).

---

## 1. Refresh the player pool

**Do this the day of the draft.** The pool is a dated, immutable snapshot of Sleeper's player list with all
ranking and ADP stripped out (DESIGN AD-5). A draft binds to whichever snapshot `latest.json` pointed at
**when the draft was created**, so refreshing after you create the draft has no effect on it.

> **Order matters: publish the pool _before_ you create the draft.**

### Rehearse

```bash
POOL_BUCKET=$(terraform -chdir=infra output -raw pool_bucket) \
  pnpm --filter @opendraft/pool publish:snapshot -- --dry-run
```

Read the output before going further. A healthy run looks like:

```
Sleeper players: 12226
Snapshot 2026-09-07: 444 players
By position: {"QB":40,"RB":70,"WR":80,"TE":40,"K":32,"DEF":32,"DL":50,"LB":50,"DB":50}
```

Sanity checks: the raw Sleeper count is in the thousands, the snapshot is a few hundred, and **no position
is zero**. The script refuses to publish an empty pool, but it cannot tell that Sleeper returned a
plausible-looking wrong answer — that judgement is yours.

### Publish

```bash
POOL_BUCKET=$(terraform -chdir=infra output -raw pool_bucket) \
  pnpm --filter @opendraft/pool publish:snapshot
```

This uploads `pools/<YYYY-MM-DD>.json` and repoints `pools/latest.json` at it. No redeploy, no code change.

### Verify

```bash
curl -s "$(terraform -chdir=infra output -raw pool_base_url)/latest.json"
# {"snapshotId":"2026-09-07"}
```

### Flags worth knowing

| Flag | Use |
|---|---|
| `--dry-run` | Build and report; upload nothing. Always run this first. |
| `--id <id>` | Override the `YYYY-MM-DD` default — how you publish twice in one day (`2026-09-07b`). |
| `--no-latest` | Upload the dated object but leave the pointer alone. Stage a snapshot ahead of time. |
| `--force` | Overwrite an existing dated object. **Avoid** — see below. |

### Why dated snapshots are immutable

Clients cache a pool in IndexedDB keyed by snapshot id. Rewriting an id already in the wild would never
reach a client holding it, and would mutate the pool underneath an in-flight draft — so the two would
silently disagree about who is available. Publish a **new id** instead. `--force` exists for the case where
you are certain nothing has loaded the id yet, and it is the wrong answer everywhere else.

### Rolling back

`latest.json` is the only mutable object, so a bad publish is a pointer move, not a restore:

```bash
BUCKET=$(terraform -chdir=infra output -raw pool_bucket)
aws s3 ls "s3://$BUCKET/pools/"                      # find the id you want
echo '{"snapshotId":"<good-id>"}' \
  | aws s3 cp - "s3://$BUCKET/pools/latest.json" \
      --content-type application/json \
      --cache-control 'public, max-age=0, must-revalidate'
```

Drafts already created keep the snapshot they bound to and are unaffected either way.

---

## 2. Deploy a change

Full detail lives in [`../infra/README.md`](../infra/README.md); this is the sequence.

```bash
# 1. Lambda bundles — REQUIRED whenever services/ or packages/ changed
cd infra/build && npm run build && cd ../..

# 2. Infrastructure + Lambda code
terraform -chdir=infra apply

# 3. Web bundle, built against the live endpoints
export VITE_HTTP_BASE=$(terraform -chdir=infra output -raw http_api_endpoint)
export VITE_WS_URL=$(terraform -chdir=infra output -raw ws_client_url)
export VITE_POOL_BASE=$(terraform -chdir=infra output -raw pool_base_url)
export VITE_LEAGUE_ID=$(terraform -chdir=infra output -raw league_id)
pnpm --filter @opendraft/web build

aws s3 sync apps/web/dist "s3://$(terraform -chdir=infra output -raw web_bucket)/" --delete
aws cloudfront create-invalidation \
  --distribution-id "$(terraform -chdir=infra output -raw cloudfront_distribution_id)" --paths '/*'
```

> **The web bundle and the Lambda code are one release, not two.** `packages/shared` is compiled into
> both — reveal timings, the event envelope, the engine's own reducer. Shipping the browser half alone
> gives you a client animating to one clock while the server schedules on another, or a UI offering an
> action the deployed Lambda rejects. Always do step 1 and 2 before step 3.

State lives at `infra/terraform.tfstate` on the operator's machine (local backend, by design — see
`infra/backend.tf`). **It is the only copy.** Back it up, or migrate to the documented S3 + lock backend.

---

## 3. Reach a draft you can't find in the UI

Draft ids are UUIDs, and the admin console records the current one in that browser's `localStorage`. A
different machine, cleared site data, or a dead laptop loses the *pointer* — never the draft. Everything
committed is in DynamoDB with no TTL, plus 35 days of point-in-time recovery.

**On the night, the cheap insurance is to save the link**: `/export?draft=<id>` needs no admin token and
opens the board on any device.

To recover an id after the fact:

```bash
aws dynamodb query \
  --table-name "$(terraform -chdir=infra output -raw table_name)" \
  --key-condition-expression 'PK = :pk AND begins_with(SK, :sk)' \
  --filter-expression '#t = :draft' \
  --expression-attribute-names '{"#t":"type"}' \
  --expression-attribute-values \
    '{":pk":{"S":"LEAGUE#<league-id>"},":sk":{"S":"DRAFT#"},":draft":{"S":"DRAFT"}}' \
  --query 'Items[].{id:draftId.S,status:status.S,created:createdAt.N}' --output table
```

Use `league_id` from `terraform output` for `<league-id>`. Then open
`https://<your-domain>/export?draft=<id>`.

---

## 4. Restore a draft from a bad edit

Picks are an append-only log and the admin console can already undo, rewind, edit and reassign — reach for
those first. Point-in-time recovery is for the case where the table itself is wrong: it restores to a
**new** table, so recovering means restoring, reading the items you need, and writing them back. It is not
a one-command rollback, and PITR keeps 35 days.

```bash
aws dynamodb restore-table-to-point-in-time \
  --source-table-name "$(terraform -chdir=infra output -raw table_name)" \
  --target-table-name opendraft-recovery-$(date +%s) \
  --restore-date-time <ISO-8601>
```

Never point Terraform at the recovery table. Read from it, write what you need back into the live table,
then delete it — an idle on-demand table is cheap but not free.

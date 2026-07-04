# OpenDraft — Infrastructure (`infra/`)

Terraform for the self-hosted, single-league OpenDraft stack (DESIGN §11, CONVENTIONS §8).
Everything the `services/api` handlers need: one DynamoDB table, five Lambdas behind a WebSocket
API and an HTTP API, an EventBridge Scheduler group + role for one-shot auto-picks, S3 + CloudFront
for the web bundle and pool snapshots, and two SSM SecureString secrets.

Design goal: **idle cost ≈ $0** (AD-1). Everything bills per-use.

---

## Layout

```
infra/
├── main.tf            # module wiring (the DAG)
├── locals.tf          # derived names + constructed ARNs
├── variables.tf       # all inputs (env, region, secrets, domain, …)
├── outputs.tf         # endpoints, bucket names, ARNs
├── providers.tf       # aws provider + default_tags
├── versions.tf        # required_version + provider constraints
├── backend.tf         # local backend (default) + S3+lock migration notes
├── terraform.tfvars.example
├── build/             # esbuild Lambda bundler (see "Build the Lambda artifacts")
│   ├── build.mjs
│   └── package.json
└── modules/
    ├── dynamodb/      # single table, on-demand, TTL, no GSIs
    ├── ssm/           # two SecureString params (values set out-of-band)
    ├── scheduler/     # EventBridge Scheduler group
    ├── s3-cloudfront/ # private web + pool buckets, CloudFront (OAC, HTTPS)
    ├── apigw-ws/      # WebSocket API + routes + stage
    ├── apigw-http/    # HTTP API v2 + routes + $default stage
    ├── iam/           # least-privilege role per Lambda + scheduler role
    └── lambda/        # 5 functions, log groups, invoke permissions
```

---

## Prerequisites

- **Terraform** ≥ 1.6 (`terraform version`). This module was validated with 1.9.8.
  Not installed? `curl -fsSLo tf.zip https://releases.hashicorp.com/terraform/1.9.8/terraform_1.9.8_linux_amd64.zip && unzip tf.zip && sudo mv terraform /usr/local/bin/`
- **Node 20** for the esbuild bundling step. This repo uses nvm: `nvm use 20`.
- **AWS credentials** with permission to create the resources (Kyle runs `apply`).
- Region defaults to **us-east-1**. If you use a custom domain, its ACM cert **must** be in us-east-1
  (CloudFront requirement) regardless of `var.region`.

---

## 1. Build the Lambda artifacts (required before `plan`/`apply`)

The five Lambdas are bundled from `services/api/src/handlers/{ws,http,autopick}.ts` with esbuild into
Lambda-ready ESM. `@aws-sdk/*` is left external (provided by the `nodejs20.x` runtime); everything else
(workspace packages, bcryptjs) is bundled. The bundler is isolated from the pnpm workspace on purpose and
**does not modify app source**.

```bash
cd infra/build
npm install          # installs the pinned esbuild only (first time)
npm run build        # writes dist/{ws,http,autopick}/index.mjs
```

Produces:

| Bundle                    | Used by Lambdas                          | Handler string(s)                                  |
|---------------------------|------------------------------------------|----------------------------------------------------|
| `dist/ws/index.mjs`       | `ws-connect`, `ws-disconnect`, `ws-action` | `index.connect`, `index.disconnect`, `index.action` |
| `dist/http/index.mjs`     | `http`                                   | `index.handler`                                    |
| `dist/autopick/index.mjs` | `autopick`                               | `index.handler`                                    |

Terraform zips these `dist/*` dirs at plan time via `archive_file`. **Re-run `npm run build` whenever the
API source changes**, then `terraform apply` (the zip hash changes → Lambda code updates).

---

## 2. Terraform init / plan / apply

```bash
cd infra
terraform init
terraform plan   -var 'league_id=my-league'
terraform apply  -var 'league_id=my-league'
```

Prefer a tfvars file: `cp terraform.tfvars.example my.auto.tfvars` and edit (the `*.auto.tfvars`
pattern is gitignored, so secrets never get committed).

Key variables (all have defaults — see `variables.tf`):

| Variable             | Default        | Notes |
|----------------------|----------------|-------|
| `env`                | `dev`          | drives names, tags, SSM paths |
| `region`             | `us-east-1`    | |
| `league_id`          | `opendraft`    | the single league's id |
| `enable_pitr`        | `false`        | DynamoDB PITR (off = cheapest) |
| `lambda_memory_mb`   | `256`          | |
| `log_retention_days` | `14`           | |
| `domain_name`        | `""`           | optional custom domain (else CloudFront default) |
| `acm_certificate_arn`| `""`           | required with `domain_name`; **must be us-east-1** |

Useful outputs after apply: `ws_client_url`, `http_api_endpoint`, `cloudfront_domain_name`,
`web_bucket`, `cloudfront_distribution_id`, `pool_bucket`, `ssm_passcode_hash_param`, `ssm_hmac_key_param`.

---

## 3. Set the two secrets (out-of-band, after first apply)

Terraform **creates** the SSM SecureString params with placeholder values and `ignore_changes` on the
value, so it never stores or reverts real secrets. Set the real values once via the CLI:

```bash
# Admin passcode -> bcrypt hash. Any bcrypt tool works; e.g. with Node:
HASH=$(node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" 'YOUR_ADMIN_PASSCODE')
aws ssm put-parameter --overwrite --type SecureString \
  --name "$(terraform output -raw ssm_passcode_hash_param)" --value "$HASH"

# Session HMAC key — a random 32-byte key:
KEY=$(openssl rand -base64 32)
aws ssm put-parameter --overwrite --type SecureString \
  --name "$(terraform output -raw ssm_hmac_key_param)" --value "$KEY"
```

(`bcryptjs` is already a dependency of `services/api`, so `node -e` above works from that package, or run
it anywhere `bcryptjs` is installed.)

---

## 4. Deploy the web bundle (later — the app doesn't exist yet)

The web bucket + CloudFront distribution are provisioned empty. Once `apps/web` is built:

```bash
aws s3 sync apps/web/dist "s3://$(terraform output -raw web_bucket)/" --delete
aws cloudfront create-invalidation \
  --distribution-id "$(terraform output -raw cloudfront_distribution_id)" --paths '/*'
```

Load the app at `https://$(terraform output -raw cloudfront_domain_name)` (or your custom domain).

The **player-pool snapshots** land in the pool bucket under `pools/` (POOL_PREFIX) and are served through
the same CloudFront distribution at `/pools/*`. The `services/pool` job writes them; Terraform only creates
the bucket.

> SPA note: CloudFront maps S3 403/404 to `/index.html` (200) so client-side routes (`/station`, `/board`,
> `/admin`, `/export`) survive a refresh. Tradeoff: a genuinely missing `pools/*` object also returns the
> app shell with 200 — the client parses JSON and surfaces the error. Acceptable at single-league scale.

---

## Dependency graph (why it's acyclic)

WS/HTTP API endpoints are needed in Lambda env vars, but the APIs' integrations need Lambda ARNs — a
naive wiring would cycle. It's broken by **constructing** the Lambda invoke ARNs and the autopick ARN from
`account_id`/`region`/name in `locals.tf` (function names are deterministic), so:

```
dynamodb, ssm, scheduler, s3-cloudfront   →  (leaf)
apigw-ws, apigw-http                       →  use constructed invoke ARNs (no lambda dep)
iam                                        →  needs table/ssm/pool ARNs + ws ManageConnections ARN
lambda                                     →  needs iam role ARNs + ws endpoint + api source ARNs
```

`plan` reaches the STS/credentials step without any cycle error — confirmed.

---

## State backend

Defaults to a **local** backend (`terraform.tfstate` on disk) — zero bootstrap, $0, fine for one operator.
To move to a remote, locking backend (S3 + a DynamoDB lock table), follow the commented instructions in
`backend.tf`, then `terraform init -migrate-state`.

Commit `.terraform.lock.hcl` (provider pins) for reproducibility; `.terraform/` and `*.tfstate*` are
gitignored.

---

## Cost sketch (single league)

| State           | Rough monthly cost |
|-----------------|--------------------|
| **Idle** (no draft) | **≈ $0** — DynamoDB on-demand, Lambda, both API Gateways, and Scheduler bill per request; only S3 storage (a few MB) + the CloudFront distribution existing are effectively free-tier / sub-cent. |
| **During a draft** | **pennies** — a few thousand WS messages + DynamoDB writes + Lambda ms + a handful of one-shot schedules. |

Optional cost adders you control: `enable_pitr=true` (~$0.20/GB-month of continuous backups),
higher `lambda_memory_mb`, longer `log_retention_days`.

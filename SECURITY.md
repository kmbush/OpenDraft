# Security Policy

OpenDraft is self-hosted and handles admin authentication (a bcrypt-hashed passcode and an HMAC-signed
session token). We take security reports seriously.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Instead, report privately via GitHub's
[**Report a vulnerability**](https://github.com/kmbush/OpenDraft/security/advisories/new) form (Security
tab → Advisories), which opens a private channel with the maintainers.

Please include:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- The affected component (`services/api`, `apps/web`, `infra/`, …) and version/commit if known.

You can expect an initial acknowledgement within a few days. Once a fix is available, we'll coordinate
disclosure with you.

## Scope & good-practice notes

Because OpenDraft is self-hosted, some of the security posture is in **your** hands:

- **Secrets** (`admin_passcode_hash`, `session_hmac_key`) are set out-of-band in SSM Parameter Store and
  must never be committed. See [`infra/README.md`](infra/README.md).
- **Terraform state** contains sensitive material — keep the backend private (see
  [`infra/backend.tf`](infra/backend.tf)).
- **Deployment config** (account IDs, domains, tfvars) belongs outside this repo — see the README's
  "Deploying your own instance — what stays private" section.

Reports about a misconfigured *personal* deployment (e.g. a public S3 bucket you created) aren't
vulnerabilities in OpenDraft itself, but we're happy to help you harden your setup via a normal issue.

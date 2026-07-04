variable "env" {
  description = "Deployment environment name (drives resource names, tags, and SSM paths)."
  type        = string
  default     = "dev"
}

variable "region" {
  description = "AWS region for all resources. CloudFront is global; a custom-domain ACM cert must live in us-east-1 (see var.acm_certificate_arn)."
  type        = string
  default     = "us-east-1"
}

variable "league_id" {
  description = "The single league's id (LEAGUE_ID env var). Every DynamoDB item is scoped by LEAGUE#<league_id> (tenancy discipline, CONVENTIONS §7)."
  type        = string
  default     = "opendraft"
}

variable "table_name" {
  description = "DynamoDB table name. Empty = derive as opendraft-<env>-draft."
  type        = string
  default     = ""
}

variable "pool_bucket_name" {
  description = "S3 bucket for player-pool snapshots. Empty = derive as opendraft-<env>-pool-<account_id> (bucket names are global, so the account id keeps it unique)."
  type        = string
  default     = ""
}

variable "web_bucket_name" {
  description = "S3 bucket for the built apps/web bundle. Empty = derive as opendraft-<env>-web-<account_id>."
  type        = string
  default     = ""
}

variable "pool_prefix" {
  description = "Key prefix for pool snapshots inside the pool bucket (POOL_PREFIX). Also the CloudFront cache-behavior path and the S3 GetObject scope for the autopick role."
  type        = string
  default     = "pools/"
}

variable "scheduler_group_name" {
  description = "EventBridge Scheduler group for one-shot auto-pick schedules. Empty = derive as opendraft-<env>."
  type        = string
  default     = ""
}

variable "enable_pitr" {
  description = "Enable DynamoDB point-in-time recovery. Off by default for a hobby deploy (adds ~$0.20/GB-month of continuous backups). Turn on for a real draft if you want it."
  type        = bool
  default     = false
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for every Lambda log group."
  type        = number
  default     = 14
}

variable "lambda_memory_mb" {
  description = "Memory (MB) for the Lambda functions. 256 gives a snappier cold start than 128 at negligible cost for a few-days-a-year workload."
  type        = number
  default     = 256
}

# --- Custom domain (optional) -------------------------------------------------
# Leave both empty to serve the web app on the default *.cloudfront.net domain
# (works out of the box). To use your own domain, bring an ACM cert in us-east-1.

variable "domain_name" {
  description = "Optional custom domain (CNAME/alias) for the CloudFront web distribution. Empty = use the default CloudFront domain."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for var.domain_name. MUST be in us-east-1 (CloudFront requirement). Required only if domain_name is set."
  type        = string
  default     = ""
}

# --- Secrets (values NOT stored in code) --------------------------------------
# These map to the two SSM SecureString params (AD-8, §4.6). Defaults are
# placeholders so `terraform plan` works; set the real values out-of-band after
# apply (see infra/README.md) — the param resources `ignore_changes` on value so
# an out-of-band update won't drift. You MAY instead pass real values here via a
# *.auto.tfvars that is gitignored.

variable "admin_passcode_hash" {
  description = "bcrypt hash of the admin passcode (AD-8). Placeholder default; set the real value out-of-band."
  type        = string
  sensitive   = true
  default     = "REPLACE_ME_bcrypt_hash"
}

variable "session_hmac_key" {
  description = "Random 32-byte key (base64/hex) used to sign HMAC admin session tokens. Placeholder default; set the real value out-of-band."
  type        = string
  sensitive   = true
  default     = "REPLACE_ME_hmac_key"
}

# --- Auth tunables (optional; handler defaults mirror these) -------------------

variable "session_ttl_sec" {
  description = "Admin session token TTL in seconds (SESSION_TTL_SEC)."
  type        = number
  default     = 3600
}

variable "auth_max_attempts" {
  description = "Max admin passcode attempts within the window (AUTH_MAX_ATTEMPTS)."
  type        = number
  default     = 5
}

variable "auth_window_sec" {
  description = "Rate-limit window for passcode attempts, in seconds (AUTH_WINDOW_SEC)."
  type        = number
  default     = 900
}

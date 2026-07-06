# Admin secrets (AD-8, §4.6). SecureString params encrypted with the AWS-managed
# alias/aws/ssm key (no monthly key charge).
#
# Secrets-in-state hygiene: apply creates these with a harmless PLACEHOLDER value
# (the root vars default to "REPLACE_ME_*" — never a real secret), then the real
# passcode hash / HMAC key are set out-of-band with
#   aws ssm put-parameter --overwrite --type SecureString --name <path> --value <secret>
# (see infra/README.md §3). `ignore_changes = [value]` stops Terraform from
# reverting that out-of-band write, so real secrets never need to live in tfvars.
# (The placeholder still lands in state on create; the real secret does not.)
resource "aws_ssm_parameter" "passcode_hash" {
  name        = var.passcode_hash_param_name
  description = "OpenDraft admin passcode bcrypt hash (AD-8)."
  type        = "SecureString"
  value       = var.passcode_hash_value
  tags        = var.tags

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "hmac_key" {
  name        = var.hmac_key_param_name
  description = "OpenDraft session-token HMAC key (AD-8)."
  type        = "SecureString"
  value       = var.hmac_key_value
  tags        = var.tags

  lifecycle {
    ignore_changes = [value]
  }
}

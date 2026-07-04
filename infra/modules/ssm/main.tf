# Admin secrets (AD-8, §4.6). SecureString params encrypted with the AWS-managed
# alias/aws/ssm key (no monthly key charge). Real secret values are set
# out-of-band after apply; `ignore_changes` on value keeps Terraform from
# reverting them and keeps the plaintext out of state churn.
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

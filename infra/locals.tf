data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = var.region

  name_prefix = "opendraft-${var.env}"

  # Derived resource names (allow explicit overrides via vars).
  table_name           = var.table_name != "" ? var.table_name : "${local.name_prefix}-draft"
  pool_bucket_name     = var.pool_bucket_name != "" ? var.pool_bucket_name : "${local.name_prefix}-pool-${local.account_id}"
  web_bucket_name      = var.web_bucket_name != "" ? var.web_bucket_name : "${local.name_prefix}-web-${local.account_id}"
  scheduler_group_name = var.scheduler_group_name != "" ? var.scheduler_group_name : local.name_prefix

  # Deterministic Lambda function names.
  fn_names = {
    ws_connect    = "${local.name_prefix}-ws-connect"
    ws_disconnect = "${local.name_prefix}-ws-disconnect"
    ws_action     = "${local.name_prefix}-ws-action"
    http          = "${local.name_prefix}-http"
    autopick      = "${local.name_prefix}-autopick"
  }

  # Constructed ARNs. Built from account/region/name rather than resource
  # references so the module graph stays a DAG (no lambda<->apigw cycle, no
  # autopick self-reference in its own env). See infra/README.md "Dependency graph".
  autopick_arn = "arn:aws:lambda:${local.region}:${local.account_id}:function:${local.fn_names.autopick}"

  # SSM SecureString parameter paths (AD-8, §4.6).
  ssm_passcode_hash_param = "/opendraft/${var.env}/admin-passcode-hash"
  ssm_hmac_key_param      = "/opendraft/${var.env}/session-hmac-key"

  # Lambda invoke ARNs in the API Gateway path form (what apigatewayv2
  # integrations expect for AWS_PROXY). Constructed to keep apigw independent
  # of the lambda module.
  invoke_arn = {
    for k, name in local.fn_names :
    k => "arn:aws:apigateway:${local.region}:lambda:path/2015-03-31/functions/arn:aws:lambda:${local.region}:${local.account_id}:function:${name}/invocations"
  }
}

# Root wiring. Module dependency order (a DAG — see infra/README.md):
#
#   dynamodb, ssm, scheduler, s3-cloudfront   (leaf resources)
#   apigw-ws, apigw-http                       (use constructed lambda invoke ARNs)
#   iam                                        (needs ws ManageConnections ARN)
#   lambda                                     (needs role ARNs + ws endpoint + api source ARNs)

module "dynamodb" {
  source      = "./modules/dynamodb"
  name        = local.table_name
  enable_pitr = var.enable_pitr
  tags        = { name = local.table_name }
}

module "ssm" {
  source                   = "./modules/ssm"
  passcode_hash_param_name = local.ssm_passcode_hash_param
  hmac_key_param_name      = local.ssm_hmac_key_param
  passcode_hash_value      = var.admin_passcode_hash
  hmac_key_value           = var.session_hmac_key
}

module "scheduler" {
  source     = "./modules/scheduler"
  group_name = local.scheduler_group_name
}

module "s3_cloudfront" {
  source           = "./modules/s3-cloudfront"
  name_prefix      = local.name_prefix
  pool_bucket_name = local.pool_bucket_name
  web_bucket_name  = local.web_bucket_name
  pool_prefix      = var.pool_prefix
  domain_name      = var.domain_name
  # BYO cert (var.acm_certificate_arn) or the Terraform-managed one from dns.tf
  # when a Route53 zone is configured.
  acm_certificate_arn = local.effective_acm_certificate_arn
}

module "apigw_ws" {
  source                = "./modules/apigw-ws"
  name                  = "${local.name_prefix}-ws"
  region                = local.region
  connect_invoke_arn    = local.invoke_arn.ws_connect
  disconnect_invoke_arn = local.invoke_arn.ws_disconnect
  action_invoke_arn     = local.invoke_arn.ws_action
}

module "apigw_http" {
  source             = "./modules/apigw-http"
  name               = "${local.name_prefix}-http"
  http_invoke_arn    = local.invoke_arn.http
  cors_allow_origins = local.web_allowed_origins
  routes = [
    "POST /admin/session",
    "POST /leagues",
    "GET /leagues/{id}",
    "POST /leagues/{id}/drafts",
    "GET /leagues/{id}/drafts/{draftId}",
    "PUT /leagues/{id}/drafts/{draftId}/order",
    "GET /leagues/{id}/drafts/{draftId}/pool",
  ]
}

module "iam" {
  source                    = "./modules/iam"
  name_prefix               = local.name_prefix
  region                    = local.region
  account_id                = local.account_id
  fn_names                  = local.fn_names
  scheduler_role_name       = "${local.name_prefix}-scheduler"
  table_arn                 = module.dynamodb.table_arn
  ssm_passcode_hash_arn     = module.ssm.passcode_hash_param_arn
  ssm_hmac_key_arn          = module.ssm.hmac_key_param_arn
  ws_manage_connections_arn = module.apigw_ws.manage_connections_arn
  pool_bucket_arn           = module.s3_cloudfront.pool_bucket_arn
  pool_prefix               = var.pool_prefix
  scheduler_group_name      = module.scheduler.group_name
  autopick_arn              = local.autopick_arn
}

module "lambda" {
  source             = "./modules/lambda"
  fn_names           = local.fn_names
  role_arns          = module.iam.role_arns
  artifacts_dir      = "${path.module}/build/dist"
  memory_mb          = var.lambda_memory_mb
  log_retention_days = var.log_retention_days
  ws_source_arn      = module.apigw_ws.lambda_source_arn
  http_source_arn    = module.apigw_http.lambda_source_arn

  env = {
    LEAGUE_ID               = var.league_id
    TABLE_NAME              = module.dynamodb.table_name
    WS_API_ENDPOINT         = module.apigw_ws.ws_endpoint
    POOL_BUCKET             = module.s3_cloudfront.pool_bucket_name
    POOL_PREFIX             = var.pool_prefix
    SCHEDULER_TARGET_ARN    = local.autopick_arn
    SCHEDULER_ROLE_ARN      = module.iam.scheduler_role_arn
    SCHEDULER_GROUP_NAME    = module.scheduler.group_name
    SSM_PASSCODE_HASH_PARAM = module.ssm.passcode_hash_param_name
    SSM_HMAC_KEY_PARAM      = module.ssm.hmac_key_param_name
    SESSION_TTL_SEC         = tostring(var.session_ttl_sec)
    AUTH_MAX_ATTEMPTS       = tostring(var.auth_max_attempts)
    AUTH_WINDOW_SEC         = tostring(var.auth_window_sec)
  }
}

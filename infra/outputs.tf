# --- Web build config (VITE_*) -----------------------------------------------
# These five feed the apps/web build 1:1. A deploy script maps:
#   http_api_endpoint -> VITE_HTTP_BASE
#   ws_client_url     -> VITE_WS_URL
#   pool_base_url     -> VITE_POOL_BASE
#   web_url           -> app origin (also the API's CORS allow-list)
#   league_id         -> VITE_LEAGUE_ID

output "web_url" {
  description = "VITE app origin — where the browser loads OpenDraft (custom domain if set, else CloudFront)."
  value       = local.web_base_url
}

output "pool_base_url" {
  description = "VITE_POOL_BASE — CloudFront base for player-pool snapshots (no trailing slash); the app fetches <this>/<file>.json."
  value       = local.pool_base_url
}

output "league_id" {
  description = "VITE_LEAGUE_ID — the single league's id."
  value       = var.league_id
}

output "table_name" {
  description = "DynamoDB table name."
  value       = module.dynamodb.table_name
}

output "ws_api_endpoint" {
  description = "WS_API_ENDPOINT (https, used by handlers to postToConnection)."
  value       = module.apigw_ws.ws_endpoint
}

output "ws_client_url" {
  description = "VITE_WS_URL — wss:// URL for the frontend to connect to."
  value       = module.apigw_ws.ws_client_url
}

output "http_api_endpoint" {
  description = "VITE_HTTP_BASE — HTTP API base URL for setup/config CRUD (execute-api, called cross-origin)."
  value       = module.apigw_http.api_endpoint
}

output "pool_bucket" {
  description = "Pool snapshot bucket (POOL_BUCKET)."
  value       = module.s3_cloudfront.pool_bucket_name
}

output "web_bucket" {
  description = "Web bundle bucket — `aws s3 sync apps/web/dist s3://<this>`."
  value       = module.s3_cloudfront.web_bucket_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution id (for cache invalidation)."
  value       = module.s3_cloudfront.distribution_id
}

output "cloudfront_domain_name" {
  description = "Default CloudFront domain to load the app (unless a custom domain is set)."
  value       = module.s3_cloudfront.distribution_domain_name
}

output "acm_certificate_arn" {
  description = "The us-east-1 ACM cert fronting the custom domain: the Terraform-managed cert when route53_zone_name is set, else the BYO var.acm_certificate_arn (empty on a default CloudFront-domain deploy)."
  value       = local.effective_acm_certificate_arn
}

output "scheduler_group_name" {
  description = "EventBridge Scheduler group (SCHEDULER_GROUP_NAME)."
  value       = module.scheduler.group_name
}

output "scheduler_role_arn" {
  description = "SCHEDULER_ROLE_ARN."
  value       = module.iam.scheduler_role_arn
}

output "autopick_lambda_arn" {
  description = "SCHEDULER_TARGET_ARN (autopick Lambda)."
  value       = local.autopick_arn
}

output "ssm_passcode_hash_param" {
  description = "SSM path to set the admin passcode bcrypt hash."
  value       = module.ssm.passcode_hash_param_name
}

output "ssm_hmac_key_param" {
  description = "SSM path to set the session HMAC key."
  value       = module.ssm.hmac_key_param_name
}

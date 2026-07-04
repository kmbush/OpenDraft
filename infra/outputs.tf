output "table_name" {
  description = "DynamoDB table name."
  value       = module.dynamodb.table_name
}

output "ws_api_endpoint" {
  description = "WS_API_ENDPOINT (https, used by handlers to postToConnection)."
  value       = module.apigw_ws.ws_endpoint
}

output "ws_client_url" {
  description = "wss:// URL for the frontend to connect to."
  value       = module.apigw_ws.ws_client_url
}

output "http_api_endpoint" {
  description = "HTTP API base URL for setup/config CRUD."
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

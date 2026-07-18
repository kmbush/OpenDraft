output "pool_bucket_name" {
  description = "Pool snapshot bucket name (POOL_BUCKET)."
  value       = aws_s3_bucket.pool.id
}

output "pool_bucket_arn" {
  description = "Pool bucket ARN."
  value       = aws_s3_bucket.pool.arn
}

output "web_bucket_name" {
  description = "Web bundle bucket name (target for `aws s3 sync` of apps/web/dist)."
  value       = aws_s3_bucket.web.id
}

output "web_bucket_arn" {
  description = "Web bucket ARN."
  value       = aws_s3_bucket.web.arn
}

output "distribution_id" {
  description = "CloudFront distribution id (for cache invalidation on web deploy)."
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_domain_name" {
  description = "Default CloudFront domain (*.cloudfront.net)."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "distribution_hosted_zone_id" {
  description = "CloudFront's Route53 hosted-zone id (the alias target for a custom-domain A/AAAA record)."
  value       = aws_cloudfront_distribution.this.hosted_zone_id
}

output "distribution_arn" {
  description = "CloudFront distribution ARN."
  value       = aws_cloudfront_distribution.this.arn
}

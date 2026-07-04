variable "name_prefix" {
  description = "Name prefix (opendraft-<env>) for CloudFront/OAC naming."
  type        = string
}

variable "pool_bucket_name" {
  description = "Player-pool snapshot bucket name."
  type        = string
}

variable "web_bucket_name" {
  description = "Static web-app bucket name."
  type        = string
}

variable "pool_prefix" {
  description = "Pool object key prefix (e.g. pools/). Drives the CloudFront cache behavior and the pool bucket policy scope."
  type        = string
}

variable "domain_name" {
  description = "Optional custom domain (alias). Empty = default CloudFront domain."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "us-east-1 ACM cert ARN for domain_name. Required only when domain_name is set."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}

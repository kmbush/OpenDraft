variable "name" {
  description = "HTTP API name."
  type        = string
}

variable "http_invoke_arn" {
  description = "API Gateway invoke ARN (path form) for the http Lambda."
  type        = string
}

variable "routes" {
  description = "List of route keys (\"METHOD /path\") mapped to the http Lambda."
  type        = list(string)
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}

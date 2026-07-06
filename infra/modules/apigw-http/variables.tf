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

variable "cors_allow_origins" {
  description = "Exact web origins (scheme + host, no trailing slash) allowed to call the API cross-origin. Empty = no CORS block (same-origin only)."
  type        = list(string)
  default     = []
}

variable "cors_allow_methods" {
  description = "HTTP methods allowed by CORS preflight. Covers the routes the web app actually uses."
  type        = list(string)
  default     = ["GET", "POST", "PUT", "OPTIONS"]
}

variable "cors_allow_headers" {
  description = "Request headers allowed by CORS preflight."
  type        = list(string)
  default     = ["authorization", "content-type"]
}

variable "cors_allow_credentials" {
  description = "Whether to allow credentialed (cookie) requests. False: auth is a bearer token in the Authorization header, not a cookie."
  type        = bool
  default     = false
}

variable "cors_max_age" {
  description = "How long (seconds) a browser may cache the preflight response."
  type        = number
  default     = 3600
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}

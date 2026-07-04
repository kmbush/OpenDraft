variable "fn_names" {
  description = "Map of function key => Lambda function name."
  type        = map(string)
}

variable "role_arns" {
  description = "Map of function key => execution role ARN."
  type        = map(string)
}

variable "artifacts_dir" {
  description = "Directory containing the built bundles (dist), one subdir per artifact: ws/, http/, autopick/."
  type        = string
}

variable "memory_mb" {
  description = "Lambda memory (MB)."
  type        = number
  default     = 256
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention."
  type        = number
  default     = 14
}

variable "ws_source_arn" {
  description = "WebSocket API execute-api source ARN for lambda invoke permission."
  type        = string
}

variable "http_source_arn" {
  description = "HTTP API execute-api source ARN for lambda invoke permission."
  type        = string
}

variable "env" {
  description = "Environment variables applied to every function (the infra contract). All values are strings."
  type        = map(string)
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}

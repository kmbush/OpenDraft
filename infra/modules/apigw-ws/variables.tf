variable "name" {
  description = "WebSocket API name."
  type        = string
}

variable "stage_name" {
  description = "Single stage name. Part of WS_API_ENDPOINT (.../<stage>)."
  type        = string
  default     = "prod"
}

variable "connect_invoke_arn" {
  description = "API Gateway invoke ARN (path form) for the ws-connect Lambda."
  type        = string
}

variable "disconnect_invoke_arn" {
  description = "API Gateway invoke ARN (path form) for the ws-disconnect Lambda."
  type        = string
}

variable "action_invoke_arn" {
  description = "API Gateway invoke ARN (path form) for the ws-action Lambda ($default route)."
  type        = string
}

variable "region" {
  description = "AWS region (used to build the client endpoint URL)."
  type        = string
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}

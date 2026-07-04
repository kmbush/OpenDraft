variable "name_prefix" {
  description = "Name prefix (opendraft-<env>)."
  type        = string
}

variable "region" {
  description = "AWS region."
  type        = string
}

variable "account_id" {
  description = "AWS account id."
  type        = string
}

variable "fn_names" {
  description = "Map of logical function key => Lambda function name (ws_connect, ws_disconnect, ws_action, http, autopick)."
  type        = map(string)
}

variable "scheduler_role_name" {
  description = "Name for the EventBridge Scheduler execution role (SCHEDULER_ROLE)."
  type        = string
}

variable "table_arn" {
  description = "DynamoDB table ARN."
  type        = string
}

variable "ssm_passcode_hash_arn" {
  description = "Passcode-hash SSM parameter ARN."
  type        = string
}

variable "ssm_hmac_key_arn" {
  description = "HMAC-key SSM parameter ARN."
  type        = string
}

variable "ws_manage_connections_arn" {
  description = "execute-api ARN scoped to POST /@connections/* (for ManageConnections)."
  type        = string
}

variable "pool_bucket_arn" {
  description = "Pool bucket ARN."
  type        = string
}

variable "pool_prefix" {
  description = "Pool object key prefix (scopes s3:GetObject)."
  type        = string
}

variable "scheduler_group_name" {
  description = "Schedule group name (scopes scheduler:*Schedule to schedule/<group>/*)."
  type        = string
}

variable "autopick_arn" {
  description = "Autopick Lambda ARN (scheduler role's InvokeFunction target)."
  type        = string
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}

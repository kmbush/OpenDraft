variable "group_name" {
  description = "EventBridge Scheduler group name for OpenDraft one-shot auto-pick schedules."
  type        = string
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}

variable "name" {
  description = "Table name."
  type        = string
}

variable "enable_pitr" {
  description = "Enable point-in-time recovery."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}

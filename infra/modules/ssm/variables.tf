variable "passcode_hash_param_name" {
  description = "SSM path for the admin passcode bcrypt hash."
  type        = string
}

variable "hmac_key_param_name" {
  description = "SSM path for the session HMAC key."
  type        = string
}

variable "passcode_hash_value" {
  description = "Initial value for the passcode hash. Placeholder is fine — value is ignored after create (set out-of-band)."
  type        = string
  sensitive   = true
}

variable "hmac_key_value" {
  description = "Initial value for the HMAC key. Placeholder is fine — value is ignored after create (set out-of-band)."
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Resource tags."
  type        = map(string)
  default     = {}
}

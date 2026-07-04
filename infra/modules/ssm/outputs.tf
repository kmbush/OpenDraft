output "passcode_hash_param_name" {
  description = "Passcode-hash parameter name."
  value       = aws_ssm_parameter.passcode_hash.name
}

output "hmac_key_param_name" {
  description = "HMAC-key parameter name."
  value       = aws_ssm_parameter.hmac_key.name
}

output "passcode_hash_param_arn" {
  description = "Passcode-hash parameter ARN."
  value       = aws_ssm_parameter.passcode_hash.arn
}

output "hmac_key_param_arn" {
  description = "HMAC-key parameter ARN."
  value       = aws_ssm_parameter.hmac_key.arn
}

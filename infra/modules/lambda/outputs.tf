output "function_arns" {
  description = "Map of function key => Lambda ARN."
  value       = { for k, fn in aws_lambda_function.fn : k => fn.arn }
}

output "function_names" {
  description = "Map of function key => Lambda name."
  value       = { for k, fn in aws_lambda_function.fn : k => fn.function_name }
}

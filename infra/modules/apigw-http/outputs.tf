output "api_id" {
  description = "HTTP API id."
  value       = aws_apigatewayv2_api.this.id
}

output "api_endpoint" {
  description = "Base HTTP API endpoint (https://<id>.execute-api.<region>.amazonaws.com)."
  value       = aws_apigatewayv2_api.this.api_endpoint
}

output "execute_arn" {
  description = "Base execute-api ARN."
  value       = aws_apigatewayv2_api.this.execution_arn
}

output "lambda_source_arn" {
  description = "execute-api ARN wildcard for lambda invoke permission."
  value       = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

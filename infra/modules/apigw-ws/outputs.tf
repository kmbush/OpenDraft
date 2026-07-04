output "api_id" {
  description = "WebSocket API id."
  value       = aws_apigatewayv2_api.this.id
}

output "stage_name" {
  description = "Stage name."
  value       = aws_apigatewayv2_stage.this.name
}

# WS_API_ENDPOINT: the management (https) endpoint used by the handlers to
# postToConnection (ApiGatewayBroadcaster), per the infra contract.
output "ws_endpoint" {
  description = "https://<id>.execute-api.<region>.amazonaws.com/<stage>"
  value       = "https://${aws_apigatewayv2_api.this.id}.execute-api.${var.region}.amazonaws.com/${aws_apigatewayv2_stage.this.name}"
}

# wss client URL (for the frontend build config, not a Lambda env var).
output "ws_client_url" {
  description = "wss://<id>.execute-api.<region>.amazonaws.com/<stage>"
  value       = "wss://${aws_apigatewayv2_api.this.id}.execute-api.${var.region}.amazonaws.com/${aws_apigatewayv2_stage.this.name}"
}

output "execute_arn" {
  description = "Base execute-api ARN (arn:aws:execute-api:region:acct:apiId)."
  value       = aws_apigatewayv2_api.this.execution_arn
}

# Scope for execute-api:ManageConnections granted to ws-action / autopick roles.
output "manage_connections_arn" {
  description = "execute-api ARN scoped to POST /@connections/* on this stage."
  value       = "${aws_apigatewayv2_api.this.execution_arn}/${aws_apigatewayv2_stage.this.name}/POST/@connections/*"
}

# Source ARN for the aws_lambda_permission granting API Gateway invoke rights.
output "lambda_source_arn" {
  description = "execute-api ARN wildcard for lambda invoke permission."
  value       = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

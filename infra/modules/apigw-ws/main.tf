# WebSocket API (AD-1). Routes: $connect (accepts optional ?role=), $disconnect,
# $default (all draft actions). Route selection reads the `action` field of the
# inbound JSON body. Integrations use constructed invoke ARNs, so this module
# does not depend on the lambda module (keeps the graph acyclic).
resource "aws_apigatewayv2_api" "this" {
  name                       = var.name
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
  tags                       = var.tags
}

resource "aws_apigatewayv2_integration" "connect" {
  api_id                    = aws_apigatewayv2_api.this.id
  integration_type          = "AWS_PROXY"
  integration_method        = "POST"
  integration_uri           = var.connect_invoke_arn
  content_handling_strategy = "CONVERT_TO_TEXT"
}

resource "aws_apigatewayv2_integration" "disconnect" {
  api_id                    = aws_apigatewayv2_api.this.id
  integration_type          = "AWS_PROXY"
  integration_method        = "POST"
  integration_uri           = var.disconnect_invoke_arn
  content_handling_strategy = "CONVERT_TO_TEXT"
}

resource "aws_apigatewayv2_integration" "action" {
  api_id                    = aws_apigatewayv2_api.this.id
  integration_type          = "AWS_PROXY"
  integration_method        = "POST"
  integration_uri           = var.action_invoke_arn
  content_handling_strategy = "CONVERT_TO_TEXT"
}

resource "aws_apigatewayv2_route" "connect" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.connect.id}"
}

resource "aws_apigatewayv2_route" "disconnect" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.disconnect.id}"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.action.id}"
}

resource "aws_apigatewayv2_stage" "this" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = var.stage_name
  auto_deploy = true
  tags        = var.tags
}

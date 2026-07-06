# HTTP API v2 for setup/config CRUD + pool URL. All routes fan into the single
# `http` Lambda (payload format 2.0). Uses the built-in $default stage with
# auto-deploy. Integration uses a constructed invoke ARN (no lambda dependency).
#
# CORS: the web app is served cross-origin from CloudFront and calls this
# execute-api URL directly, so browsers send a preflight (OPTIONS) for every
# POST/PUT with an Authorization or non-simple Content-Type header. API Gateway
# HTTP APIs answer that preflight automatically from `cors_configuration` — no
# OPTIONS route or Lambda invocation needed. The block is only emitted when at
# least one allowed origin is supplied (empty list = same-origin only / disabled).
resource "aws_apigatewayv2_api" "this" {
  name          = var.name
  protocol_type = "HTTP"
  tags          = var.tags

  dynamic "cors_configuration" {
    for_each = length(var.cors_allow_origins) > 0 ? [1] : []
    content {
      allow_origins = var.cors_allow_origins
      allow_methods = var.cors_allow_methods
      allow_headers = var.cors_allow_headers
      # Auth is a bearer token in the Authorization header (not a cookie), so
      # credentials mode is off. Keeping it false also permits explicit origins
      # without the "*" restriction AWS enforces when credentials are allowed.
      allow_credentials = var.cors_allow_credentials
      max_age           = var.cors_max_age
    }
  }
}

resource "aws_apigatewayv2_integration" "http" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = var.http_invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "routes" {
  for_each  = toset(var.routes)
  api_id    = aws_apigatewayv2_api.this.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.http.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true
  tags        = var.tags
}

# The five handler Lambdas (Node 20, ESM). All are thin adapters over
# services/api; every one calls buildDeps() at cold start and therefore needs
# the full env contract (var.env). The ws-connect/disconnect/action functions
# share one bundle (ws.zip) with different exported handlers.

locals {
  functions = {
    ws_connect    = { handler = "index.connect", artifact = "ws", timeout = 15 }
    ws_disconnect = { handler = "index.disconnect", artifact = "ws", timeout = 15 }
    ws_action     = { handler = "index.action", artifact = "ws", timeout = 29 }
    http          = { handler = "index.handler", artifact = "http", timeout = 29 }
    autopick      = { handler = "index.handler", artifact = "autopick", timeout = 60 }
  }
  ws_functions = ["ws_connect", "ws_disconnect", "ws_action"]
}

# Zip each built bundle. Requires `dist/<artifact>/index.mjs` to exist — run the
# esbuild step (infra/build) before `terraform plan` (see infra/README.md).
data "archive_file" "zip" {
  for_each    = toset(["ws", "http", "autopick"])
  type        = "zip"
  source_dir  = "${var.artifacts_dir}/${each.key}"
  output_path = "${path.module}/.artifacts/${each.key}.zip"
}

resource "aws_cloudwatch_log_group" "fn" {
  for_each          = var.fn_names
  name              = "/aws/lambda/${each.value}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "fn" {
  for_each = local.functions

  function_name = var.fn_names[each.key]
  role          = var.role_arns[each.key]
  runtime       = "nodejs20.x"
  handler       = each.value.handler
  memory_size   = var.memory_mb
  timeout       = each.value.timeout

  filename         = data.archive_file.zip[each.value.artifact].output_path
  source_code_hash = data.archive_file.zip[each.value.artifact].output_base64sha256

  environment {
    variables = var.env
  }

  depends_on = [aws_cloudwatch_log_group.fn]
  tags       = var.tags
}

# Allow API Gateway to invoke the WS + HTTP handlers.
resource "aws_lambda_permission" "ws" {
  for_each      = toset(local.ws_functions)
  statement_id  = "AllowWebSocketInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = var.ws_source_arn
}

resource "aws_lambda_permission" "http" {
  statement_id  = "AllowHttpInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.fn["http"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = var.http_source_arn
}

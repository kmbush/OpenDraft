output "role_arns" {
  description = "Map of function key => execution role ARN."
  value = {
    ws_connect    = aws_iam_role.ws_connect.arn
    ws_disconnect = aws_iam_role.ws_disconnect.arn
    ws_action     = aws_iam_role.ws_action.arn
    http          = aws_iam_role.http.arn
    autopick      = aws_iam_role.autopick.arn
  }
}

output "scheduler_role_arn" {
  description = "EventBridge Scheduler role ARN (SCHEDULER_ROLE_ARN)."
  value       = aws_iam_role.scheduler.arn
}

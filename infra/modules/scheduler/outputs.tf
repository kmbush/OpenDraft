output "group_name" {
  description = "Schedule group name."
  value       = aws_scheduler_schedule_group.this.name
}

output "group_arn" {
  description = "Schedule group ARN."
  value       = aws_scheduler_schedule_group.this.arn
}

# Schedule group for the one-shot auto-pick schedules (AD-1, AD-11). The
# individual schedules are created at RUNTIME by the ws-action / autopick
# Lambdas (scheduler:CreateSchedule), not by Terraform — this only provisions
# the group they land in.
resource "aws_scheduler_schedule_group" "this" {
  name = var.group_name
  tags = var.tags
}

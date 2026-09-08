output "log_group_name" {
  description = "Name of the provisioned CloudWatch log group"
  value       = aws_cloudwatch_log_group.this.name
}

output "log_group_arn" {
  description = "ARN of the provisioned CloudWatch log group"
  value       = aws_cloudwatch_log_group.this.arn
}

output "alarm_arns" {
  description = "Map of created CloudWatch alarm ARNs"
  value = {
    high_cpu            = aws_cloudwatch_metric_alarm.high_cpu.arn
    high_memory         = aws_cloudwatch_metric_alarm.high_memory.arn
    high_disk           = aws_cloudwatch_metric_alarm.high_disk.arn
    status_check_failed = aws_cloudwatch_metric_alarm.status_check_failed.arn
  }
}

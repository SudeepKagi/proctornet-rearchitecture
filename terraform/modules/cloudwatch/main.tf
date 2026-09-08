# ProctorNet CloudWatch Module
# Provisions:
# - Log Group for container & syslog streaming (/aws/ec2/proctornet/${var.environment})
# - 4 critical infrastructure metric alarms:
#   1. High CPU Utilization (AWS/EC2)
#   2. High Memory Utilization (CWAgent mem_used_percent)
#   3. High Disk Utilization (CWAgent disk_used_percent on /opt/proctornet/data)
#   4. Status Check Failure (AWS/EC2 StatusCheckFailed)

resource "aws_cloudwatch_log_group" "this" {
  #checkov:skip=CKV_AWS_158:CloudWatch Log Group KMS CMK encryption is optional; standard AWS server-side encryption is sufficient
  #checkov:skip=CKV_AWS_338:CloudWatch log retention is managed per environment policy (30 days)
  name              = "/aws/ec2/${var.project_name}/${var.environment}"
  retention_in_days = var.log_retention_days

  tags = {
    Name        = "/aws/ec2/${var.project_name}/${var.environment}"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

# 1. High CPU Alarm
resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-High-CPU"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Alert when EC2 CPU utilization exceeds 80% for 10 consecutive minutes"

  dimensions = {
    InstanceId = var.instance_id
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-High-CPU"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

# 2. High Memory Alarm (via CWAgent)
resource "aws_cloudwatch_metric_alarm" "high_memory" {
  alarm_name          = "${var.project_name}-${var.environment}-High-Memory"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "mem_used_percent"
  namespace           = "CWAgent"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "Alert when EC2 host memory utilization exceeds 85% for 10 consecutive minutes"

  dimensions = {
    InstanceId = var.instance_id
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-High-Memory"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

# 3. High Disk Alarm on Persistent Data Volume (via CWAgent)
resource "aws_cloudwatch_metric_alarm" "high_disk" {
  alarm_name          = "${var.project_name}-${var.environment}-High-Disk-DataVolume"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "disk_used_percent"
  namespace           = "CWAgent"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "Alert when persistent data volume (/opt/proctornet/data) exceeds 85% capacity"

  dimensions = {
    InstanceId = var.instance_id
    path       = "/opt/proctornet/data"
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-High-Disk-DataVolume"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

# 4. Status Check Failed Alarm (EC2 Hypervisor / System Recovery)
resource "aws_cloudwatch_metric_alarm" "status_check_failed" {
  alarm_name          = "${var.project_name}-${var.environment}-StatusCheckFailed"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1
  alarm_description   = "Alert immediately when EC2 instance or system status check fails"

  dimensions = {
    InstanceId = var.instance_id
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-StatusCheckFailed"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

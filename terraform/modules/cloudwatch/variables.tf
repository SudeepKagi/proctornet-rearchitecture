variable "environment" {
  type        = string
  description = "Deployment environment (e.g. production, staging)"
}

variable "project_name" {
  type        = string
  description = "Project name identifier for resource naming and tagging"
  default     = "proctornet"
}

variable "instance_id" {
  type        = string
  description = "EC2 Instance ID to monitor with CloudWatch metric alarms"
}

variable "log_retention_days" {
  type        = number
  description = "Retention period in days for CloudWatch log groups"
  default     = 30
}

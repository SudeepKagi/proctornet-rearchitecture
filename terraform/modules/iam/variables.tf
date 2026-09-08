variable "environment" {
  type        = string
  description = "Deployment environment (e.g. production, staging)"
}

variable "project_name" {
  type        = string
  description = "Project name identifier for resource naming and tagging"
  default     = "proctornet"
}

variable "evidence_bucket_name" {
  type        = string
  description = "Name of the S3 evidence bucket"
}

variable "backup_bucket_name" {
  type        = string
  description = "Name of the S3 backup bucket"
}

variable "aws_region" {
  type        = string
  description = "AWS region for resource ARN construction"
  default     = "ap-south-1"
}

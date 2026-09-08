variable "aws_region" {
  type        = string
  description = "AWS region for Terraform state bootstrap infrastructure"
  default     = "ap-south-1"
}

variable "environment" {
  type        = string
  description = "Deployment environment (e.g. production, staging)"
  default     = "production"
}

variable "project_name" {
  type        = string
  description = "Project name identifier for resource naming and tagging"
  default     = "proctornet"
}

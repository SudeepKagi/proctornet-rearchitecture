variable "enable_alb" {
  type        = bool
  description = "Feature toggle to provision Application Load Balancer (default false in Phase 20; deferred to Phase 21+)"
  default     = false
}

variable "environment" {
  type        = string
  description = "Deployment environment (e.g. production, staging)"
}

variable "project_name" {
  type        = string
  description = "Project name identifier for resource naming and tagging"
  default     = "proctornet"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where the ALB and target groups reside"
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "List of public subnet IDs across multiple AZs for ALB placement"
}

variable "security_group_id" {
  type        = string
  description = "Security group ID for the ALB allowing public 80/443"
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN for ALB HTTPS listener"
  default     = ""
}

variable "target_instance_ids" {
  type        = list(string)
  description = "List of EC2 instance IDs to register with the ALB target group"
  default     = []
}

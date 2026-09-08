variable "aws_region" {
  type        = string
  description = "AWS region for staging infrastructure"
  default     = "ap-south-1"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "staging"
}

variable "project_name" {
  type        = string
  description = "Project name identifier for resource naming and tagging"
  default     = "proctornet"
}

variable "domain_name" {
  type        = string
  description = "Staging fully qualified domain name (e.g. staging.proctornet.com)"
  default     = "staging.proctornet.com"
}

variable "admin_email" {
  type        = string
  description = "Administrator email for Let's Encrypt TLS registration"
  default     = "admin@proctornet.com"
}

variable "instance_type" {
  type        = string
  description = "EC2 instance type for staging disposable validation (burstable capacity to reduce spend)"
  default     = "t3.large"
}

variable "key_name" {
  type        = string
  description = "Optional SSH key pair name (AWS SSM Session Manager is primary management)"
  default     = null
}

variable "admin_cidr" {
  type        = string
  description = "Restricted IPv4 CIDR for administrative SSH access (e.g. WireGuard VPN gateway). Never set to 0.0.0.0/0."
  default     = ""
}

variable "enable_rds" {
  type        = bool
  description = "Feature toggle for Amazon RDS PostgreSQL 16 (default false in Phase 20)"
  default     = false
}

variable "enable_elasticache" {
  type        = bool
  description = "Feature toggle for Amazon ElastiCache Redis 7 (default false in Phase 20)"
  default     = false
}

variable "enable_alb" {
  type        = bool
  description = "Feature toggle for Application Load Balancer (default false in Phase 20)"
  default     = false
}

variable "evidence_noncurrent_version_expiration_days" {
  type        = number
  description = "Days before non-current evidence object versions expire"
  default     = 7
}

variable "backup_retention_days" {
  type        = number
  description = "Days before database backup archives in S3 expire"
  default     = 14
}

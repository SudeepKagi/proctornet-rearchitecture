variable "aws_region" {
  type        = string
  description = "AWS region for production infrastructure"
  default     = "ap-south-1"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "production"
}

variable "project_name" {
  type        = string
  description = "Project name identifier for resource naming and tagging"
  default     = "proctornet"
}

variable "domain_name" {
  type        = string
  description = "Production fully qualified domain name (e.g. exam.proctornet.com)"
  default     = "exam.proctornet.com"
}

variable "admin_email" {
  type        = string
  description = "Administrator email for Let's Encrypt TLS registration"
  default     = "admin@proctornet.com"
}

variable "instance_type" {
  type        = string
  description = "EC2 instance type for high-concurrency live examination delivery (dedicated compute)"
  default     = "c6i.xlarge"
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
  description = "Feature toggle for Amazon RDS PostgreSQL 16 (default false in Phase 20; containerized DB active)"
  default     = false
}

variable "enable_elasticache" {
  type        = bool
  description = "Feature toggle for Amazon ElastiCache Redis 7 (default false in Phase 20; containerized Redis active)"
  default     = false
}

variable "enable_alb" {
  type        = bool
  description = "Feature toggle for Application Load Balancer (default false in Phase 20; deferred to Phase 21+)"
  default     = false
}

variable "evidence_noncurrent_version_expiration_days" {
  type        = number
  description = "Days before non-current evidence object versions expire (null = retain indefinitely)"
  default     = null
}

variable "backup_retention_days" {
  type        = number
  description = "Days before database backup archives in S3 expire"
  default     = 90
}

variable "enable_rds" {
  type        = bool
  description = "Feature toggle to provision Amazon RDS PostgreSQL 16 (default false in Phase 20)"
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


variable "db_subnet_group_name" {
  type        = string
  description = "DB Subnet Group name for RDS placement across private subnets"
}

variable "security_group_id" {
  type        = string
  description = "Security group ID allowing inbound PostgreSQL 5432 from EC2 host"
}

variable "instance_class" {
  type        = string
  description = "RDS database instance class"
  default     = "db.t4g.medium"
}

variable "db_name" {
  type        = string
  description = "Initial database name"
  default     = "proctornet"
}

variable "db_user" {
  type        = string
  description = "Master database username"
  default     = "postgres"
}

variable "db_password" {
  type        = string
  description = "Master database password (leave empty to use AWS Secrets Manager master password)"
  default     = ""
  sensitive   = true
}

variable "allocated_storage" {
  type        = number
  description = "Allocated storage size in GiB (gp3)"
  default     = 50
}

variable "max_allocated_storage" {
  type        = number
  description = "Maximum storage autoscaling threshold in GiB"
  default     = 200
}

variable "multi_az" {
  type        = bool
  description = "Enable Multi-AZ failover replica for high availability"
  default     = true
}

variable "backup_retention_period" {
  type        = number
  description = "Automated backup retention in days"
  default     = 7
}

variable "environment" {
  type        = string
  description = "Deployment environment (e.g. production, staging)"
}

variable "project_name" {
  type        = string
  description = "Project name identifier for resource naming and tagging"
  default     = "proctornet"
}

variable "domain_name" {
  type        = string
  description = "Domain name for ProctorNet CORS origin configuration (e.g. exam.proctornet.com)"
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

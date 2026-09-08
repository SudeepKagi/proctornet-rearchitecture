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
  description = "VPC ID where security groups are provisioned"
}

variable "admin_cidr" {
  type        = string
  description = "Restricted IPv4 CIDR block for administrative SSH access (e.g. WireGuard VPN gateway). Leave empty or set to /32 for no public SSH."
  default     = ""
}

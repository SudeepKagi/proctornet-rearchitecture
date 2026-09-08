variable "environment" {
  type        = string
  description = "Deployment environment (e.g. production, staging)"
}

variable "project_name" {
  type        = string
  description = "Project name identifier for resource naming and tagging"
  default     = "proctornet"
}


variable "public_subnet_id" {
  type        = string
  description = "Public subnet ID where the EC2 host is placed"
}

variable "security_group_id" {
  type        = string
  description = "Security group ID for the EC2 host"
}

variable "instance_profile_name" {
  type        = string
  description = "IAM instance profile name attached to the EC2 host"
}

variable "instance_type" {
  type        = string
  description = "EC2 instance type (e.g. c6i.xlarge for production, t3.large or t3.xlarge for staging)"
  default     = "c6i.xlarge"
}

variable "key_name" {
  type        = string
  description = "Optional EC2 SSH Key Pair name (SSM Session Manager is primary management)"
  default     = null
}

variable "domain_name" {
  type        = string
  description = "Fully qualified domain name for ProctorNet (e.g. exam.proctornet.com)"
}

variable "admin_email" {
  type        = string
  description = "Administrator email for Let's Encrypt TLS registration"
  default     = "admin@proctornet.com"
}

variable "root_volume_size" {
  type        = number
  description = "Size of the root EBS volume in GiB (gp3 encrypted)"
  default     = 50
}

variable "data_volume_size" {
  type        = number
  description = "Size of the persistent data EBS volume in GiB (gp3 encrypted, mounted at /opt/proctornet/data)"
  default     = 100
}

variable "aws_region" {
  type        = string
  description = "AWS region"
  default     = "ap-south-1"
}

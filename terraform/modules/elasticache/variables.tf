variable "enable_elasticache" {
  type        = bool
  description = "Feature toggle to provision Amazon ElastiCache Redis 7 (default false in Phase 20)"
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

variable "elasticache_subnet_group_name" {
  type        = string
  description = "Subnet group name for ElastiCache placement across private subnets"
}

variable "security_group_id" {
  type        = string
  description = "Security group ID allowing inbound Redis 6379 from EC2 host"
}

variable "node_type" {
  type        = string
  description = "ElastiCache node type (e.g. cache.t4g.small)"
  default     = "cache.t4g.small"
}

variable "num_cache_clusters" {
  type        = number
  description = "Number of cache clusters in the replication group"
  default     = 2
}

variable "auth_token" {
  type        = string
  description = "Redis AUTH token for in-transit password protection (min 16 chars)"
  default     = null
  sensitive   = true
}

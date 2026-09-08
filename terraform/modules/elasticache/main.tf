# ProctorNet ElastiCache Redis 7 Module (Scale Ready)
# Authored as reusable, fully parameterized module.
# Default in Phase 20: enable_elasticache = false (remains containerized on EC2 loopback per approved architecture).

#checkov:skip=CKV_AWS_30:AUTH token is enabled when auth_token variable is supplied via SSM
#checkov:skip=CKV_AWS_31:Transit encryption is explicitly enabled
#checkov:skip=CKV_AWS_29:At-rest encryption is explicitly enabled
resource "aws_elasticache_replication_group" "this" {
  count = var.enable_elasticache ? 1 : 0

  replication_group_id = "${var.project_name}-${var.environment}-redis"
  description          = "ProctorNet Redis Replication Group for sliding-window rate limiting and pub/sub"

  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_clusters
  parameter_group_name = "default.redis7"
  port                 = 6379

  subnet_group_name  = var.elasticache_subnet_group_name
  security_group_ids = [var.security_group_id]

  automatic_failover_enabled = true
  multi_az_enabled           = true

  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  auth_token                 = var.auth_token

  auto_minor_version_upgrade = true

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
    ScaleReady  = "true"
  }
}

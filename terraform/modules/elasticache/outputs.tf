output "redis_endpoint" {
  description = "Primary endpoint address of the ElastiCache Redis replication group"
  value       = try(aws_elasticache_replication_group.this[0].primary_endpoint_address, "")
}

output "redis_port" {
  description = "Port number of the ElastiCache Redis replication group"
  value       = try(aws_elasticache_replication_group.this[0].port, 6379)
}

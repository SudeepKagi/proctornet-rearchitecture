output "ec2_instance_id" {
  description = "Instance ID of the production EC2 host"
  value       = module.ec2.instance_id
}

output "ec2_public_ip" {
  description = "Public IP address of the production EC2 host"
  value       = module.ec2.public_ip
}

output "ec2_elastic_ip" {
  description = "Elastic IP announced for WebRTC ICE candidates and Coturn TURN relay"
  value       = module.ec2.elastic_ip
}

output "evidence_bucket_name" {
  description = "S3 evidence storage bucket name"
  value       = module.s3.evidence_bucket_name
}

output "backup_bucket_name" {
  description = "S3 database backup bucket name"
  value       = module.s3.backup_bucket_name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for host system and container logs"
  value       = module.cloudwatch.log_group_name
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (when enable_rds = true)"
  value       = module.rds.rds_endpoint
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint (when enable_elasticache = true)"
  value       = module.elasticache.redis_endpoint
}

output "alb_dns_name" {
  description = "ALB DNS name (when enable_alb = true)"
  value       = module.alb.alb_dns_name
}

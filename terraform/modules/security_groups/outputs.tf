output "ec2_security_group_id" {
  description = "ID of the EC2 instance security group"
  value       = aws_security_group.ec2.id
}

output "rds_security_group_id" {
  description = "ID of the RDS PostgreSQL security group"
  value       = aws_security_group.rds.id
}

output "elasticache_security_group_id" {
  description = "ID of the ElastiCache Redis security group"
  value       = aws_security_group.elasticache.id
}

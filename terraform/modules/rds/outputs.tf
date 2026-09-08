output "rds_endpoint" {
  description = "Connection endpoint for the RDS PostgreSQL database"
  value       = try(aws_db_instance.this[0].endpoint, "")
}

output "rds_address" {
  description = "Hostname address of the RDS PostgreSQL database"
  value       = try(aws_db_instance.this[0].address, "")
}

output "rds_port" {
  description = "Port number of the RDS PostgreSQL database"
  value       = try(aws_db_instance.this[0].port, 5432)
}

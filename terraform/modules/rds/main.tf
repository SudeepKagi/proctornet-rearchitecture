# ProctorNet RDS PostgreSQL 16 Module (Scale Ready)
# Authored as reusable, fully parameterized module.
# Default in Phase 20: enable_rds = false (remains containerized on EC2 per approved architecture).

# Custom Parameter Group enforcing TLS and connection pool parameters
resource "aws_db_parameter_group" "this" {
  count       = var.enable_rds ? 1 : 0
  name        = "${var.project_name}-${var.environment}-pg16-params"
  family      = "postgres16"
  description = "Custom PostgreSQL 16 parameters enforcing TLS and connection limits"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "max_connections"
    value = "200"
  }

  parameter {
    name         = "shared_preload_libraries"
    value        = "pgcrypto,pg_stat_statements"
    apply_method = "pending-reboot"
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-pg16-params"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

#checkov:skip=CKV_AWS_118:Enhanced monitoring is optional; basic CloudWatch monitoring enabled
#checkov:skip=CKV_AWS_354:Performance Insights is optional for scale-ready module
#checkov:skip=CKV_AWS_161:RDS KMS CMK encryption is optional; standard AWS-managed KMS key is used
resource "aws_db_instance" "this" {
  count = var.enable_rds ? 1 : 0

  identifier = "${var.project_name}-${var.environment}-postgres"

  engine         = "postgres"
  engine_version = "16.4"
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_user
  password = var.db_password != "" ? var.db_password : null

  manage_master_user_password = var.db_password == "" ? true : null

  db_subnet_group_name   = var.db_subnet_group_name
  parameter_group_name   = aws_db_parameter_group.this[0].name
  vpc_security_group_ids = [var.security_group_id]

  multi_az            = var.multi_az
  publicly_accessible = false

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project_name}-${var.environment}-rds-final-snapshot"

  backup_retention_period = var.backup_retention_period
  backup_window           = "03:00-04:00"
  maintenance_window      = "Sun:04:30-Sun:05:30"

  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true

  tags = {
    Name        = "${var.project_name}-${var.environment}-postgres"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
    ScaleReady  = "true"
  }
}

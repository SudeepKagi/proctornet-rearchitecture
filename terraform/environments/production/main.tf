# ProctorNet Production Environment Root
# Provisions the single-host active production baseline:
# - VPC with dual-AZ subnets (2 public, 2 private)
# - Least-privilege Security Groups with strict trust boundaries
# - S3 private evidence bucket (ADR-0005) and daily backup bucket
# - Scoped IAM instance role & profile (SSM, S3, CloudWatch)
# - Single active EC2 host (c6i.xlarge) with Elastic IP and encrypted gp3 persistent data volume
# - CloudWatch Agent host telemetry (mem/disk) and critical alarms
# - Scale-ready toggleable modules (RDS, ElastiCache, ALB) disabled by default

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "ProctorNet"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Phase       = "20"
      Repository  = "SudeepKagi/proctornet-rearchitecture"
    }
  }
}

# 1. Dual-AZ VPC & Networking
module "vpc" {
  source = "../../modules/vpc"

  environment  = var.environment
  project_name = var.project_name
}

# 2. Security Groups & Trust Boundaries
module "security_groups" {
  source = "../../modules/security_groups"

  environment  = var.environment
  project_name = var.project_name
  vpc_id       = module.vpc.vpc_id
  admin_cidr   = var.admin_cidr
}

# 3. S3 Storage & Retention
module "s3" {
  source = "../../modules/s3"

  environment                                 = var.environment
  project_name                                = var.project_name
  domain_name                                 = var.domain_name
  evidence_noncurrent_version_expiration_days = var.evidence_noncurrent_version_expiration_days
  backup_retention_days                       = var.backup_retention_days
}

# 4. IAM Roles & Scoped Policies
module "iam" {
  source = "../../modules/iam"

  environment          = var.environment
  project_name         = var.project_name
  evidence_bucket_name = module.s3.evidence_bucket_name
  backup_bucket_name   = module.s3.backup_bucket_name
  aws_region           = var.aws_region
}

# 5. EC2 Host Compute, Storage & Elastic IP
module "ec2" {
  source = "../../modules/ec2"

  environment           = var.environment
  project_name          = var.project_name
  public_subnet_id      = module.vpc.public_subnet_ids[0]
  security_group_id     = module.security_groups.ec2_security_group_id
  instance_profile_name = module.iam.ec2_instance_profile_name
  instance_type         = var.instance_type
  key_name              = var.key_name
  domain_name           = var.domain_name
  admin_email           = var.admin_email
  aws_region            = var.aws_region
}

# 6. CloudWatch Host Telemetry & Alarms
module "cloudwatch" {
  source = "../../modules/cloudwatch"

  environment  = var.environment
  project_name = var.project_name
  instance_id  = module.ec2.instance_id
}

# 7. Scale-Ready RDS PostgreSQL 16 (Toggleable; disabled in Phase 20)
module "rds" {
  source = "../../modules/rds"

  enable_rds           = var.enable_rds
  environment          = var.environment
  project_name         = var.project_name
  db_subnet_group_name = module.vpc.db_subnet_group_name
  security_group_id    = module.security_groups.rds_security_group_id
}

# 8. Scale-Ready ElastiCache Redis 7 (Toggleable; disabled in Phase 20)
module "elasticache" {
  source = "../../modules/elasticache"

  enable_elasticache            = var.enable_elasticache
  environment                   = var.environment
  project_name                  = var.project_name
  elasticache_subnet_group_name = module.vpc.elasticache_subnet_group_name
  security_group_id             = module.security_groups.elasticache_security_group_id
}

# 9. Scale-Ready Application Load Balancer (Toggleable; deferred to Phase 21+)
module "alb" {
  source = "../../modules/alb"

  enable_alb          = var.enable_alb
  environment         = var.environment
  project_name        = var.project_name
  vpc_id              = module.vpc.vpc_id
  public_subnet_ids   = module.vpc.public_subnet_ids
  security_group_id   = module.security_groups.ec2_security_group_id
  target_instance_ids = [module.ec2.instance_id]
  certificate_arn     = var.certificate_arn
}

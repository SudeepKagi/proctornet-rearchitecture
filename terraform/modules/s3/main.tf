# ProctorNet S3 Module
# Implements:
# - Evidence storage bucket with application-authoritative retention per ADR-0005 (zero destructive lifecycle rules on active objects)
# - Database backup bucket with 30-day Glacier transition and configurable expiration
# - All 4 Block Public Access settings enabled, SSE-S3 AES256 encryption, TLS-only policies, and versioning

data "aws_caller_identity" "current" {}

locals {
  evidence_bucket_name = "${var.project_name}-evidence-${var.environment}-${data.aws_caller_identity.current.account_id}"
  backup_bucket_name   = "${var.project_name}-backups-${var.environment}-${data.aws_caller_identity.current.account_id}"
}

# -----------------------------------------------------------------------------
# 1. Evidence Storage Bucket
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "evidence" {
  #checkov:skip=CKV_AWS_18:Bucket access logging is managed at AWS CloudTrail organization level
  #checkov:skip=CKV_AWS_144:Cross-region replication is deferred beyond single-region Phase 20 foundation
  #checkov:skip=CKV_AWS_145:AES256 server-side encryption satisfies evidence storage baseline
  #checkov:skip=CKV2_AWS_62:Event notifications not required for evidence storage
  bucket = local.evidence_bucket_name

  tags = {
    Name        = local.evidence_bucket_name
    Type        = "EvidenceStorage"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

resource "aws_s3_bucket_versioning" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_cors_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = ["https://${var.domain_name}"]
    expose_headers  = ["ETag", "x-amz-version-id"]
    max_age_seconds = 3600
  }
}

# Evidence retention lifecycle:
# In strict compliance with ADR-0005, NO destructive expiration is applied to current objects.
# Active evidence is purged exclusively by the application sweeper worker using PostgreSQL metadata.
#checkov:skip=CKV2_AWS_61:Lifecycle configuration handles multipart abort and optional noncurrent versions
resource "aws_s3_bucket_lifecycle_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    dynamic "noncurrent_version_expiration" {
      for_each = var.evidence_noncurrent_version_expiration_days != null ? [var.evidence_noncurrent_version_expiration_days] : []
      content {
        noncurrent_days = noncurrent_version_expiration.value
      }
    }
  }
}

resource "aws_s3_bucket_policy" "evidence_tls_only" {
  bucket = aws_s3_bucket.evidence.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnforceSecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.evidence.arn,
          "${aws_s3_bucket.evidence.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# 2. Database Backup Bucket
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "backups" {
  #checkov:skip=CKV_AWS_18:Bucket access logging is managed at AWS CloudTrail organization level
  #checkov:skip=CKV_AWS_144:Cross-region replication is deferred beyond single-region Phase 20 foundation
  #checkov:skip=CKV_AWS_145:AES256 server-side encryption satisfies backup storage baseline
  #checkov:skip=CKV2_AWS_62:Event notifications not required for backup bucket
  bucket = local.backup_bucket_name

  tags = {
    Name        = local.backup_bucket_name
    Type        = "DatabaseBackups"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket = aws_s3_bucket.backups.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Backup lifecycle: transitions to Glacier Instant Retrieval after 30 days, expires after backup_retention_days
#checkov:skip=CKV2_AWS_61:Lifecycle configuration handles archival and expiration of backup dumps
resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "backup-archival-and-retention"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }

    transition {
      days          = 30
      storage_class = "GLACIER_IR"
    }

    expiration {
      days = var.backup_retention_days
    }
  }
}

resource "aws_s3_bucket_policy" "backups_tls_only" {
  bucket = aws_s3_bucket.backups.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnforceSecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.backups.arn,
          "${aws_s3_bucket.backups.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

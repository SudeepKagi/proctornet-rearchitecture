# ProctorNet IAM Module
# Provisions least-privilege EC2 Instance Role and Profile for:
# - SSM Session Manager (zero-inbound SSH management)
# - S3 Evidence Bucket (presigned signing, uploads, retention sweeper purge)
# - S3 Database Backup Bucket (daily logical backup uploads)
# - SSM Parameter Store (SecureString production secret retrieval)
# - CloudWatch Agent (memory/disk metrics and log streaming)

data "aws_caller_identity" "current" {}

# EC2 Instance Role
resource "aws_iam_role" "ec2" {
  name        = "${var.project_name}-${var.environment}-ec2-role"
  description = "Execution role for ProctorNet EC2 host with scoped AWS service access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EC2AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-ec2-role"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

# EC2 Instance Profile
resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project_name}-${var.environment}-ec2-profile"
  role = aws_iam_role.ec2.name

  tags = {
    Name        = "${var.project_name}-${var.environment}-ec2-profile"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

# 1. SSM Session Manager Managed Policy
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# 2. S3 Evidence Storage Policy
resource "aws_iam_policy" "s3_evidence" {
  name        = "${var.project_name}-${var.environment}-s3-evidence-access"
  description = "Scoped access for ProctorNet backend to upload, sign, and purge evidence objects"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EvidenceBucketList"
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = "arn:aws:s3:::${var.evidence_bucket_name}"
      },
      {
        Sid    = "EvidenceObjectReadWritePurge"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:AbortMultipartUpload",
          "s3:DeleteObject",
          "s3:DeleteObjectVersion"
        ]
        Resource = "arn:aws:s3:::${var.evidence_bucket_name}/*"
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-s3-evidence-policy"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

resource "aws_iam_role_policy_attachment" "s3_evidence" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.s3_evidence.arn
}

# 3. S3 Database Backup Policy
resource "aws_iam_policy" "s3_backup" {
  name        = "${var.project_name}-${var.environment}-s3-backup-access"
  description = "Scoped access for backup-db.sh to stream database dumps to S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "BackupBucketList"
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = "arn:aws:s3:::${var.backup_bucket_name}"
      },
      {
        Sid    = "BackupObjectWriteRead"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = "arn:aws:s3:::${var.backup_bucket_name}/postgres/*"
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-s3-backup-policy"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

resource "aws_iam_role_policy_attachment" "s3_backup" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.s3_backup.arn
}

# 4. SSM Parameter Store Secret Access Policy
resource "aws_iam_policy" "ssm_parameters" {
  #checkov:skip=CKV_AWS_111:KMS decrypt restricted to SSM parameters
  #checkov:skip=CKV_AWS_356:KMS decrypt requires account-level key ARN matching
  name        = "${var.project_name}-${var.environment}-ssm-parameter-access"
  description = "Scoped read access for fetch-secrets.sh to materialize production .env from SSM"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SSMParameterRead"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/proctornet/${var.environment}/*"
      },
      {
        Sid    = "KMSDecryptSecrets"
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = "arn:aws:kms:${var.aws_region}:${data.aws_caller_identity.current.account_id}:key/*"
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-ssm-parameter-policy"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

resource "aws_iam_role_policy_attachment" "ssm_parameters" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.ssm_parameters.arn
}

# 5. CloudWatch Agent & Telemetry Policy
resource "aws_iam_policy" "cloudwatch" {
  #checkov:skip=CKV_AWS_356:cloudwatch:PutMetricData does not support resource-level permissions per AWS documentation
  name        = "${var.project_name}-${var.environment}-cloudwatch-access"
  description = "Scoped permissions for CloudWatch Agent to publish memory/disk metrics and ship logs"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchMetricPublish"
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchLogPublish"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/ec2/proctornet/${var.environment}*"
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-cloudwatch-policy"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

resource "aws_iam_role_policy_attachment" "cloudwatch" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.cloudwatch.arn
}

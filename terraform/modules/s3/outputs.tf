output "evidence_bucket_name" {
  description = "Name of the S3 evidence bucket"
  value       = aws_s3_bucket.evidence.id
}

output "evidence_bucket_arn" {
  description = "ARN of the S3 evidence bucket"
  value       = aws_s3_bucket.evidence.arn
}

output "backup_bucket_name" {
  description = "Name of the S3 database backup bucket"
  value       = aws_s3_bucket.backups.id
}

output "backup_bucket_arn" {
  description = "ARN of the S3 database backup bucket"
  value       = aws_s3_bucket.backups.arn
}

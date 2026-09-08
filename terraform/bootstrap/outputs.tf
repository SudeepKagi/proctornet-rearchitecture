output "s3_bucket_name" {
  description = "Name of the provisioned S3 remote state bucket"
  value       = aws_s3_bucket.terraform_state.id
}

output "s3_bucket_arn" {
  description = "ARN of the provisioned S3 remote state bucket"
  value       = aws_s3_bucket.terraform_state.arn
}

output "aws_region" {
  description = "AWS region of the state bucket"
  value       = var.aws_region
}

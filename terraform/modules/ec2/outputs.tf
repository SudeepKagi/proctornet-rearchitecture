output "instance_id" {
  description = "ID of the ProctorNet EC2 host"
  value       = aws_instance.this.id
}

output "instance_arn" {
  description = "ARN of the ProctorNet EC2 host"
  value       = aws_instance.this.arn
}

output "public_ip" {
  description = "Public IP address of the EC2 instance"
  value       = aws_instance.this.public_ip
}

output "elastic_ip" {
  description = "Allocated Elastic IP address associated with the EC2 host"
  value       = aws_eip.this.public_ip
}

output "data_volume_id" {
  description = "ID of the persistent EBS data volume"
  value       = aws_ebs_volume.data.id
}

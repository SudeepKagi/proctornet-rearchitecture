output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = try(aws_lb.this[0].dns_name, "")
}

output "alb_zone_id" {
  description = "Canonical hosted zone ID of the Application Load Balancer"
  value       = try(aws_lb.this[0].zone_id, "")
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = try(aws_lb.this[0].arn, "")
}

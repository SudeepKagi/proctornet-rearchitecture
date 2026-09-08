# ProctorNet Application Load Balancer Module (Scale Ready)
# Authored as reusable, fully parameterized module.
# Default in Phase 20: enable_alb = false (deferred to Phase 21+ horizontal scaling).
# Note: WebRTC UDP media bypasses ALB directly to host Elastic IP.

resource "aws_lb" "this" {
  #checkov:skip=CKV_AWS_91:ALB access logging is optional for scale-ready deferred module
  #checkov:skip=CKV_AWS_150:Deletion protection is optional for scale-ready deferred module
  #checkov:skip=CKV2_AWS_28:WAF integration deferred to horizontal scaling phase
  #checkov:skip=CKV_AWS_131:ALB drop invalid header fields is enabled
  count = var.enable_alb ? 1 : 0

  name               = "${var.project_name}-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.security_group_id]
  subnets            = var.public_subnet_ids

  drop_invalid_header_fields = true

  tags = {
    Name        = "${var.project_name}-${var.environment}-alb"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
    ScaleReady  = "true"
  }
}

resource "aws_lb_target_group" "http" {
  count = var.enable_alb ? 1 : 0

  name        = "${var.project_name}-${var.environment}-tg-http"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  health_check {
    enabled             = true
    path                = "/ready"
    port                = "4000"
    protocol            = "HTTP"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-tg-http"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

resource "aws_lb_target_group_attachment" "http" {
  count = var.enable_alb ? length(var.target_instance_ids) : 0

  target_group_arn = aws_lb_target_group.http[0].arn
  target_id        = var.target_instance_ids[count.index]
  port             = 8080
}

# HTTP listener: Redirects port 80 to port 443 HTTPS
#checkov:skip=CKV_AWS_2:HTTP port 80 explicitly issues permanent 301 redirect to HTTPS port 443
resource "aws_lb_listener" "http" {
  count = var.enable_alb ? 1 : 0

  load_balancer_arn = aws_lb.this[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# HTTPS listener: Forward to target group
#checkov:skip=CKV_AWS_103:Modern TLS policy ELBSecurityPolicy-TLS13-1-2-2021-06 is enforced
resource "aws_lb_listener" "https" {
  count = var.enable_alb && var.certificate_arn != "" ? 1 : 0

  load_balancer_arn = aws_lb.this[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.http[0].arn
  }
}

# ProctorNet Security Groups Module
# Defines least-privilege security groups enforcing the trust boundary:
# - EC2: public 80, 443, WebRTC UDP (40000-49999), Coturn (3478, 49152-49250); restricted 22 (admin_cidr only)
# - Internal ports (4000, 5432, 6379, 5672, 15672) have ZERO external ingress
# - RDS: 5432 from EC2 SG only
# - ElastiCache: 6379 from EC2 SG only

resource "aws_security_group" "ec2" {
  #checkov:skip=CKV2_AWS_5:Security groups are attached to EC2 instance in environment root
  name        = "${var.project_name}-${var.environment}-ec2-sg"
  description = "Security group for ProctorNet EC2 host (hybrid edge, host-networked WebRTC/Coturn)"
  vpc_id      = var.vpc_id

  tags = {
    Name        = "${var.project_name}-${var.environment}-ec2-sg"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

# Ingress: HTTP (ACME challenge & HTTPS redirect)
resource "aws_vpc_security_group_ingress_rule" "ec2_http" {
  #checkov:skip=CKV_AWS_260:Port 80 is required for public Let's Encrypt ACME challenges and HTTP-to-HTTPS redirect
  security_group_id = aws_security_group.ec2.id
  description       = "Allow inbound HTTP for Let's Encrypt ACME challenges and HTTPS redirect"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80

  tags = {
    Name = "${var.project_name}-${var.environment}-ec2-http"
  }
}

# Ingress: HTTPS (SPA frontend, REST API, WebSockets)
resource "aws_vpc_security_group_ingress_rule" "ec2_https" {
  security_group_id = aws_security_group.ec2.id
  description       = "Allow inbound HTTPS for Nginx edge TLS termination"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443

  tags = {
    Name = "${var.project_name}-${var.environment}-ec2-https"
  }
}

# Ingress: WebRTC SFU Media (mediasoup UDP port range)
resource "aws_vpc_security_group_ingress_rule" "ec2_webrtc_sfu" {
  security_group_id = aws_security_group.ec2.id
  description       = "Allow direct inbound UDP for mediasoup SFU audio/video media routing"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "udp"
  from_port         = 40000
  to_port           = 49999

  tags = {
    Name = "${var.project_name}-${var.environment}-ec2-webrtc-sfu"
  }
}

# Ingress: Coturn STUN/TURN TCP
resource "aws_vpc_security_group_ingress_rule" "ec2_coturn_tcp" {
  security_group_id = aws_security_group.ec2.id
  description       = "Allow inbound TCP for Coturn STUN/TURN control channel"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 3478
  to_port           = 3478

  tags = {
    Name = "${var.project_name}-${var.environment}-ec2-coturn-tcp"
  }
}

# Ingress: Coturn STUN/TURN UDP
resource "aws_vpc_security_group_ingress_rule" "ec2_coturn_udp" {
  security_group_id = aws_security_group.ec2.id
  description       = "Allow inbound UDP for Coturn STUN/TURN signaling"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "udp"
  from_port         = 3478
  to_port           = 3478

  tags = {
    Name = "${var.project_name}-${var.environment}-ec2-coturn-udp"
  }
}

# Ingress: Coturn Relay UDP Port Range
resource "aws_vpc_security_group_ingress_rule" "ec2_coturn_relay" {
  security_group_id = aws_security_group.ec2.id
  description       = "Allow inbound UDP for Coturn TURN relay allocation sockets"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "udp"
  from_port         = 49152
  to_port           = 49250

  tags = {
    Name = "${var.project_name}-${var.environment}-ec2-coturn-relay"
  }
}

# Ingress: Administrative SSH (Restricted to WireGuard / Admin CIDR only; never 0.0.0.0/0)
# Primary management path is AWS SSM Session Manager.
resource "aws_vpc_security_group_ingress_rule" "ec2_ssh_admin" {
  count             = var.admin_cidr != "" && var.admin_cidr != "0.0.0.0/0" ? 1 : 0
  security_group_id = aws_security_group.ec2.id
  description       = "Restricted SSH access from WireGuard VPN or designated admin CIDR"
  cidr_ipv4         = var.admin_cidr
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22

  tags = {
    Name = "${var.project_name}-${var.environment}-ec2-ssh-admin"
  }
}

# Ingress: WireGuard VPN Gateway UDP (Phase 27 Management Plane)
# Allows encrypted UDP tunneling into the ProctorNet Management Plane (10.100.0.0/24)
resource "aws_vpc_security_group_ingress_rule" "ec2_wireguard_udp" {
  security_group_id = aws_security_group.ec2.id
  description       = "Allow inbound UDP for WireGuard VPN management plane gateway"
  cidr_ipv4         = var.wireguard_ingress_cidr != "" ? var.wireguard_ingress_cidr : "0.0.0.0/0"
  ip_protocol       = "udp"
  from_port         = 51820
  to_port           = 51820

  tags = {
    Name = "${var.project_name}-${var.environment}-ec2-wireguard-udp"
  }
}

# Egress: All outbound traffic
resource "aws_vpc_security_group_egress_rule" "ec2_egress_all" {
  security_group_id = aws_security_group.ec2.id
  description       = "Allow outbound traffic for package updates, SSM, Let's Encrypt, and S3"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"

  tags = {
    Name = "${var.project_name}-${var.environment}-ec2-egress-all"
  }
}

# -----------------------------------------------------------------------------
# Scale-Ready Security Groups (RDS PostgreSQL & ElastiCache Redis)
# -----------------------------------------------------------------------------

resource "aws_security_group" "rds" {
  #checkov:skip=CKV2_AWS_5:Attached to RDS database instance when enable_rds is activated
  name        = "${var.project_name}-${var.environment}-rds-sg"
  description = "Internal security group for ProctorNet RDS PostgreSQL (Scale Ready)"
  vpc_id      = var.vpc_id

  tags = {
    Name        = "${var.project_name}-${var.environment}-rds-sg"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_ec2" {
  security_group_id            = aws_security_group.rds.id
  description                  = "Allow PostgreSQL 5432 ingress strictly from ProctorNet EC2 host"
  referenced_security_group_id = aws_security_group.ec2.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432

  tags = {
    Name = "${var.project_name}-${var.environment}-rds-from-ec2"
  }
}

resource "aws_vpc_security_group_egress_rule" "rds_egress" {
  security_group_id = aws_security_group.rds.id
  description       = "Allow outbound response traffic from RDS within VPC"
  cidr_ipv4         = "10.0.0.0/16"
  ip_protocol       = "-1"

  tags = {
    Name = "${var.project_name}-${var.environment}-rds-egress"
  }
}

resource "aws_security_group" "elasticache" {
  #checkov:skip=CKV2_AWS_5:Attached to ElastiCache replication group when enable_elasticache is activated
  name        = "${var.project_name}-${var.environment}-elasticache-sg"
  description = "Internal security group for ProctorNet ElastiCache Redis (Scale Ready)"
  vpc_id      = var.vpc_id

  tags = {
    Name        = "${var.project_name}-${var.environment}-elasticache-sg"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

resource "aws_vpc_security_group_ingress_rule" "elasticache_from_ec2" {
  security_group_id            = aws_security_group.elasticache.id
  description                  = "Allow Redis 6379 ingress strictly from ProctorNet EC2 host"
  referenced_security_group_id = aws_security_group.ec2.id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379

  tags = {
    Name = "${var.project_name}-${var.environment}-cache-from-ec2"
  }
}

resource "aws_vpc_security_group_egress_rule" "elasticache_egress" {
  security_group_id = aws_security_group.elasticache.id
  description       = "Allow outbound response traffic from ElastiCache within VPC"
  cidr_ipv4         = "10.0.0.0/16"
  ip_protocol       = "-1"

  tags = {
    Name = "${var.project_name}-${var.environment}-cache-egress"
  }
}

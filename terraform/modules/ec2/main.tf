# ProctorNet EC2 Module
# Provisions the single-host active production baseline:
# - Ubuntu 24.04 LTS (Noble Numbat)
# - Configurable instance sizing (c6i.xlarge for prod, t3.large/xlarge for staging)
# - Encrypted gp3 root volume (50 GiB)
# - Encrypted gp3 persistent data volume (100 GiB) with prevent_destroy = true
# - Elastic IP for WebRTC ICE and Coturn TURN public address announcement
# - Cloud-Init bootstrapping (Docker, Compose, Certbot, CloudWatch Agent, secrets, backup timer)

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "this" {
  #checkov:skip=CKV_AWS_126:CloudWatch Agent provides high-resolution memory/disk telemetry and syslog streaming
  #checkov:skip=CKV_AWS_8:Instance root block device is encrypted
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  ebs_optimized          = true
  subnet_id              = var.public_subnet_id
  vpc_security_group_ids = [var.security_group_id]
  iam_instance_profile   = var.instance_profile_name
  key_name               = var.key_name

  # Encrypted gp3 root volume
  root_block_device {
    volume_size           = var.root_volume_size
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true

    tags = {
      Name        = "${var.project_name}-${var.environment}-root-vol"
      Environment = var.environment
      Project     = "ProctorNet"
      ManagedBy   = "Terraform"
      Phase       = "20"
    }
  }

  # Enforce IMDSv2 strictly
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
    instance_metadata_tags      = "enabled"
  }

  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    environment        = var.environment
    aws_region         = var.aws_region
    domain_name        = var.domain_name
    admin_email        = var.admin_email
    backup_bucket_name = "${var.project_name}-backups-${var.environment}"
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-ec2"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
    Role        = "ModularMonolithHost"
  }
}

# Persistent EBS Data Volume for Docker Compose named volumes (pg_data, redis_data, rmq_data)
# Protected by lifecycle prevent_destroy = true
resource "aws_ebs_volume" "data" {
  #checkov:skip=CKV_AWS_189:EBS volume encrypted with default AWS-managed KMS key
  availability_zone = aws_instance.this.availability_zone
  size              = var.data_volume_size
  type              = "gp3"
  encrypted         = true

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-data-vol"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
    MountPoint  = "/opt/proctornet/data"
  }
}

resource "aws_volume_attachment" "data" {
  device_name = "/dev/xvdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.this.id
}

# Elastic IP for WebRTC ICE and Coturn TURN public address announcement
resource "aws_eip" "this" {
  domain = "vpc"

  tags = {
    Name        = "${var.project_name}-${var.environment}-eip"
    Environment = var.environment
    Project     = "ProctorNet"
    ManagedBy   = "Terraform"
    Phase       = "20"
  }
}

resource "aws_eip_association" "this" {
  instance_id   = aws_instance.this.id
  allocation_id = aws_eip.this.id
}

terraform {
  backend "s3" {
    bucket       = "proctornet-terraform-state-production"
    key          = "proctornet/production/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}

terraform {
  backend "s3" {
    bucket       = "proctornet-terraform-state-staging"
    key          = "proctornet/staging/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}

terraform {
  required_version = ">= 1.6.0"

  backend "s3" {
    bucket = "anima-tfstate"
    key    = "skill-builder-landing/terraform.tfstate"
    region = "auto"
    endpoints = {
      s3 = "https://008ad6687e5dd5b877928789789147e7.r2.cloudflarestorage.com"
    }
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    # R2 doesn't implement the S3 object-integrity checksums that Terraform >= 1.6
    # sends by default; without this, state writes (PutObject) fail against R2.
    skip_s3_checksum = true
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.20.0"
    }
  }
}

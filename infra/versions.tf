terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # basic_auth_password 가 tfstate 에 평문으로 남으므로, 팀 공용으로 쓸 때는
  # 암호화된 원격 backend 사용을 권장한다.
  # backend "s3" {
  #   bucket       = "my-terraform-state-bucket"
  #   key          = "vitepress-baton-touch/terraform.tfstate"
  #   region       = "ap-northeast-2"
  #   encrypt      = true
  #   use_lockfile = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
    }
  }
}

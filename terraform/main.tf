terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }

  backend "s3" {
    bucket         = "ims-terraform-state"
    key            = "ims/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "ims-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)
  token                  = module.eks.cluster_token
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)
    token                  = module.eks.cluster_token
  }
}

# VPC
module "vpc" {
  source = "./modules/vpc"

  project     = var.project
  environment = var.environment
  aws_region  = var.aws_region
  vpc_cidr    = var.vpc_cidr
}

# EKS
module "eks" {
  source = "./modules/eks"

  project          = var.project
  environment      = var.environment
  vpc_id           = module.vpc.vpc_id
  private_subnets  = module.vpc.private_subnets
  cluster_version  = var.cluster_version
  node_instance_type = var.node_instance_type
  node_desired_size  = var.node_desired_size
  node_min_size      = var.node_min_size
  node_max_size      = var.node_max_size
}

# ECR — backend image
module "ecr_backend" {
  source = "./modules/ecr"

  name        = "${var.project}-backend"
  environment = var.environment
}

# ECR — frontend image
module "ecr_frontend" {
  source = "./modules/ecr"

  name        = "${var.project}-frontend"
  environment = var.environment
}
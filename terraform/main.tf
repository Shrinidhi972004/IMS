terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket       = "ims-terraform-state-009882533113"
    key          = "ims/terraform.tfstate"
    region       = "ap-south-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

module "vpc" {
  source      = "./modules/vpc"
  project     = var.project
  environment = var.environment
  aws_region  = var.aws_region
  vpc_cidr    = var.vpc_cidr
}

module "iam" {
  source      = "./modules/iam"
  project     = var.project
  environment = var.environment
}

module "ecr_backend" {
  source      = "./modules/ecr"
  name        = "${var.project}-backend"
  environment = var.environment
}

module "ecr_frontend" {
  source      = "./modules/ecr"
  name        = "${var.project}-frontend"
  environment = var.environment
}

module "rds" {
  source            = "./modules/rds"
  project           = var.project
  environment       = var.environment
  vpc_id            = module.vpc.vpc_id
  private_subnets   = module.vpc.private_subnets
  eks_sg_id         = module.eks.node_sg_id
  db_username       = var.db_username
  db_password       = var.db_password
  db_instance_class = var.db_instance_class
}

module "elasticache" {
  source          = "./modules/elasticache"
  project         = var.project
  environment     = var.environment
  vpc_id          = module.vpc.vpc_id
  private_subnets = module.vpc.private_subnets
  eks_sg_id       = module.eks.node_sg_id
  node_type       = var.redis_node_type
}

module "documentdb" {
  source          = "./modules/documentdb"
  project         = var.project
  environment     = var.environment
  vpc_id          = module.vpc.vpc_id
  private_subnets = module.vpc.private_subnets
  eks_sg_id       = module.eks.node_sg_id
  db_username     = var.db_username
  db_password     = var.db_password
  instance_class  = var.docdb_instance_class
}

module "eks" {
  source             = "./modules/eks"
  project            = var.project
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnets    = module.vpc.private_subnets
  public_subnets     = module.vpc.public_subnets
  cluster_version    = var.cluster_version
  node_instance_type = var.node_instance_type
  node_desired_size  = var.node_desired_size
  node_min_size      = var.node_min_size
  node_max_size      = var.node_max_size
  cluster_role_arn   = module.iam.cluster_role_arn
  node_role_arn      = module.iam.node_role_arn
}
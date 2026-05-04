output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "configure_kubectl" {
  value = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

output "ecr_backend_url" {
  value = module.ecr_backend.repository_url
}

output "ecr_frontend_url" {
  value = module.ecr_frontend.repository_url
}

output "rds_endpoint" {
  value = module.rds.endpoint
}

output "redis_endpoint" {
  value = module.elasticache.endpoint
}

output "documentdb_endpoint" {
  value = module.documentdb.endpoint
}

output "helm_values" {
  description = "Values to pass to helm install"
  sensitive   = true
  value = <<-EOT
    POSTGRES_DSN=postgres://${var.db_username}:${var.db_password}@${module.rds.endpoint}/ims?sslmode=require
    MONGO_URI=mongodb://${var.db_username}:${var.db_password}@${module.documentdb.endpoint}:27017/?tls=true&tlsCAFile=/etc/ssl/certs/ca-certificates.crt&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false
    REDIS_ADDR=${module.elasticache.endpoint}
  EOT
}
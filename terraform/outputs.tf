output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "ecr_backend_url" {
  description = "ECR URL for backend image"
  value       = module.ecr_backend.repository_url
}

output "ecr_frontend_url" {
  description = "ECR URL for frontend image"
  value       = module.ecr_frontend.repository_url
}

output "configure_kubectl" {
  description = "Command to configure kubectl"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}
output "cluster_name" {
  value = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  value = aws_eks_cluster.main.endpoint
}

output "cluster_ca_certificate" {
  value = aws_eks_cluster.main.certificate_authority[0].data
}

output "cluster_token" {
  value     = data.aws_eks_cluster_auth.main.token
  sensitive = true
}

output "node_sg_id" {
  value = aws_security_group.nodes.id
}
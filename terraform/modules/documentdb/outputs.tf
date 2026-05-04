output "cluster_id" {
  description = "The cluster identifier"
  value       = aws_docdb_cluster.main.id
}

output "endpoint" {
  description = "The connection endpoint for the DocumentDB cluster"
  value       = aws_docdb_cluster.main.endpoint
}

output "port" {
  description = "The port for DocumentDB connections"
  value       = 27017
}
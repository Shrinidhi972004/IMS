aws_region           = "ap-south-1"
project              = "ims"
environment          = "dev"
vpc_cidr             = "10.0.0.0/16"
cluster_version      = "1.31"
node_instance_type   = "t3.medium"
node_desired_size    = 3
node_min_size        = 1
node_max_size        = 5
db_username          = "imsadmin"
db_password          = "changeme"  # Override with: terraform apply -var="db_password=$DB_PASSWORD" or set TF_VAR_db_password env var
db_instance_class    = "db.t3.micro"
redis_node_type      = "cache.t3.micro"
docdb_instance_class = "db.t3.medium"
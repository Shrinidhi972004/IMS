resource "aws_security_group" "docdb" {
  name        = "${var.project}-${var.environment}-docdb-sg"
  description = "DocumentDB security group"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [var.eks_sg_id]
    description     = "MongoDB from EKS nodes"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-${var.environment}-docdb-sg"
  }
}

resource "aws_docdb_subnet_group" "main" {
  name       = "${var.project}-${var.environment}-docdb-subnet-group"
  subnet_ids = var.private_subnets

  tags = {
    Name = "${var.project}-${var.environment}-docdb-subnet-group"
  }
}

resource "aws_docdb_cluster" "main" {
  cluster_identifier     = "${var.project}-${var.environment}-docdb"
  engine                 = "docdb"
  master_username        = var.db_username
  master_password        = var.db_password
  db_subnet_group_name   = aws_docdb_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.docdb.id]
  skip_final_snapshot    = true
  deletion_protection    = false
  storage_encrypted      = true

  tags = {
    Name = "${var.project}-${var.environment}-docdb"
  }
}

resource "aws_docdb_cluster_instance" "main" {
  identifier         = "${var.project}-${var.environment}-docdb-instance"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = var.instance_class

  tags = {
    Name = "${var.project}-${var.environment}-docdb-instance"
  }
}
#!/bin/bash
# Run this ONCE before terraform init to create S3 backend

AWS_REGION="ap-south-1"
BUCKET="ims-terraform-state-$(aws sts get-caller-identity --query Account --output text)"
TABLE="ims-terraform-locks"

echo "Creating S3 bucket: $BUCKET"
aws s3api create-bucket \
  --bucket $BUCKET \
  --region $AWS_REGION \
  --create-bucket-configuration LocationConstraint=$AWS_REGION

aws s3api put-bucket-versioning \
  --bucket $BUCKET \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket $BUCKET \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

echo "Creating DynamoDB table: $TABLE"
aws dynamodb create-table \
  --table-name $TABLE \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region $AWS_REGION

echo "Done! Now update terraform/main.tf backend bucket name to: $BUCKET"
echo "Then run: terraform init"
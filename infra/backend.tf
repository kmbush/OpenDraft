# Backend configuration.
#
# DEFAULT: local backend (state file on disk at infra/terraform.tfstate).
# This is intentional for a single self-hosted league — it keeps idle cost at
# $0 and needs no bootstrap. It is NOT safe for concurrent operators.
#
# TO MIGRATE to a remote, locking backend (recommended once more than one person
# runs Terraform, or for prod), create an S3 bucket + a DynamoDB lock table once,
# then uncomment the block below and run `terraform init -migrate-state`:
#
#   aws s3api create-bucket --bucket opendraft-tfstate-<acct> --region us-east-1
#   aws s3api put-bucket-versioning --bucket opendraft-tfstate-<acct> \
#     --versioning-configuration Status=Enabled
#   aws dynamodb create-table --table-name opendraft-tflock \
#     --attribute-definitions AttributeName=LockID,AttributeType=S \
#     --key-schema AttributeName=LockID,KeyType=HASH \
#     --billing-mode PAY_PER_REQUEST
#
# terraform {
#   backend "s3" {
#     bucket         = "opendraft-tfstate-<acct>"
#     key            = "opendraft/<env>/terraform.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "opendraft-tflock"
#     encrypt        = true
#   }
# }

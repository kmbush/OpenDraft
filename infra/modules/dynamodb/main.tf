# Single-table design (AD-4, DESIGN §4). Composite key PK/SK, on-demand billing,
# TTL on `ttl` (epoch seconds) for CONN# and AUTH# items. No GSIs — every access
# pattern is PK = :pk AND begins_with(SK, ...).
resource "aws_dynamodb_table" "this" {
  name         = var.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  # Encryption at rest is ON by default with an AWS-owned key ($0 — no KMS
  # charge). We intentionally do NOT set server_side_encryption{} because that
  # forces the aws/dynamodb managed KMS key and adds per-request KMS cost for no
  # security benefit at single-league scale. Switch to a CMK later if a
  # compliance requirement appears.

  point_in_time_recovery {
    enabled = var.enable_pitr
  }

  tags = var.tags
}

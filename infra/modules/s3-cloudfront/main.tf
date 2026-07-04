# Private S3 (web bundle + pool snapshots) fronted by one CloudFront
# distribution using Origin Access Control (OAC). Both buckets are private,
# encrypted (SSE-S3, $0), block all public access, and are reachable only via
# CloudFront (DESIGN §2, §9). HTTPS only.

locals {
  has_custom_domain = var.domain_name != ""
  web_origin_id     = "web-s3"
  pool_origin_id    = "pool-s3"
}

# --- Buckets -----------------------------------------------------------------
resource "aws_s3_bucket" "web" {
  bucket = var.web_bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket" "pool" {
  bucket = var.pool_bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "pool" {
  bucket                  = aws_s3_bucket.pool.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_ownership_controls" "pool" {
  bucket = aws_s3_bucket.pool.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "pool" {
  bucket = aws_s3_bucket.pool.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# --- CloudFront + OAC --------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "this" {
  name                              = "${var.name_prefix}-oac"
  description                       = "OAC for OpenDraft web + pool origins"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  comment             = "${var.name_prefix} web + pool"
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # cheapest: North America + Europe edges
  aliases             = local.has_custom_domain ? [var.domain_name] : []
  tags                = var.tags

  origin {
    origin_id                = local.web_origin_id
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  origin {
    origin_id                = local.pool_origin_id
    domain_name              = aws_s3_bucket.pool.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  # Default behavior: the SPA bundle.
  default_cache_behavior {
    target_origin_id       = local.web_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # AWS managed cache policy "CachingOptimized".
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  # Pool snapshots served from the pool bucket.
  ordered_cache_behavior {
    path_pattern           = "${var.pool_prefix}*"
    target_origin_id       = local.pool_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  # SPA client-side routing (/station /board /admin /export): map S3 403/404 to
  # the app shell. Tradeoff: a genuinely missing pool object also returns
  # index.html with 200 — the client parses JSON and surfaces the error, so this
  # is acceptable at single-league scale (documented in infra/README.md).
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  dynamic "viewer_certificate" {
    for_each = local.has_custom_domain ? [1] : []
    content {
      acm_certificate_arn      = var.acm_certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  dynamic "viewer_certificate" {
    for_each = local.has_custom_domain ? [] : [1]
    content {
      cloudfront_default_certificate = true
    }
  }
}

# --- Bucket policies: allow only this distribution via OAC -------------------
data "aws_iam_policy_document" "web" {
  statement {
    sid       = "AllowCloudFrontOACGet"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

data "aws_iam_policy_document" "pool" {
  statement {
    sid       = "AllowCloudFrontOACGetPoolPrefix"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.pool.arn}/${var.pool_prefix}*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web.json
}

resource "aws_s3_bucket_policy" "pool" {
  bucket = aws_s3_bucket.pool.id
  policy = data.aws_iam_policy_document.pool.json
}

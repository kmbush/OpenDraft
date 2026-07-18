# Custom-domain TLS + DNS automation (optional, Route53-managed).
#
# When var.route53_zone_name is set (alongside var.domain_name), Terraform owns
# the whole custom-domain story reproducibly — no click-ops:
#   1. request an ACM cert for var.domain_name in us-east-1 (CloudFront's region),
#   2. write the DNS validation record into the hosted zone and wait for issuance,
#   3. alias var.domain_name (A + AAAA) to the CloudFront distribution.
#
# Leave route53_zone_name empty to keep the bring-your-own-cert path: pass an
# already-validated us-east-1 cert via var.acm_certificate_arn and add DNS
# yourself (for self-hosters whose DNS isn't in this account's Route53).
#
# The whole file is a no-op (count/for_each = 0) unless a Route53 zone is set,
# so it never touches state for the default *.cloudfront.net deploy.

locals {
  manage_dns = var.route53_zone_name != "" && var.domain_name != ""

  # Cert ARN handed to the CloudFront viewer_certificate: the Terraform-managed,
  # freshly validated cert when we own DNS, else the caller-supplied BYO cert.
  effective_acm_certificate_arn = local.manage_dns ? aws_acm_certificate_validation.web[0].certificate_arn : var.acm_certificate_arn
}

data "aws_route53_zone" "web" {
  count        = local.manage_dns ? 1 : 0
  name         = var.route53_zone_name
  private_zone = false
}

resource "aws_acm_certificate" "web" {
  count             = local.manage_dns ? 1 : 0
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  # Rotating/renewing the cert shouldn't blip the live distribution.
  lifecycle {
    create_before_destroy = true
  }
}

# One validation record per domain on the cert (just var.domain_name here; the
# for_each keeps it correct if SANs are ever added).
resource "aws_route53_record" "web_cert_validation" {
  for_each = {
    for dvo in(local.manage_dns ? aws_acm_certificate.web[0].domain_validation_options : []) :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = data.aws_route53_zone.web[0].zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "web" {
  count                   = local.manage_dns ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.web[0].arn
  validation_record_fqdns = [for r in aws_route53_record.web_cert_validation : r.fqdn]
}

# Alias the custom domain at the CloudFront distribution (IPv4 + IPv6). Uses the
# distribution's own hosted-zone id so the alias tracks the right target.
resource "aws_route53_record" "web_alias_a" {
  count   = local.manage_dns ? 1 : 0
  zone_id = data.aws_route53_zone.web[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = module.s3_cloudfront.distribution_domain_name
    zone_id                = module.s3_cloudfront.distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "web_alias_aaaa" {
  count   = local.manage_dns ? 1 : 0
  zone_id = data.aws_route53_zone.web[0].zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = module.s3_cloudfront.distribution_domain_name
    zone_id                = module.s3_cloudfront.distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

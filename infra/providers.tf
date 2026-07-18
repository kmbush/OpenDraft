provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project = "opendraft"
      env     = var.env
    }
  }
}

# CloudFront viewer certs and their ACM validation MUST live in us-east-1,
# regardless of var.region. Used only by the optional custom-domain resources
# in dns.tf; harmless (no resources) when no custom domain is configured.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      project = "opendraft"
      env     = var.env
    }
  }
}

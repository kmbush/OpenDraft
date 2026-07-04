provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project = "opendraft"
      env     = var.env
    }
  }
}

terraform {
  required_version = ">= 1.8.0"
}

variable "environment" {
  type        = string
  default     = "staging"
  description = "Deployment environment (staging or production)"
}

variable "region" {
  type        = string
  default     = "eu-west-1"
  description = "Low-latency region serving Lagos, Nigeria (PRD Section 8)"
}

# Placeholder cloud resource definitions for S3-compatible media buckets
# Separate public EXIF-stripped report media from private originals and LASRRA card storage (LRS-09)
output "buckets_configured" {
  value = {
    public_media       = "fixlagos-${var.environment}-public-media"
    private_originals  = "fixlagos-${var.environment}-private-originals"
    private_lasrra_ids = "fixlagos-${var.environment}-private-lasrra-ids"
  }
}

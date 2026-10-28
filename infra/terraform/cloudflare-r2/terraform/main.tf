terraform {
  required_version = ">= 1.15.0"

  # State lives on the platform: the runner exports TF_HTTP_* per job, so this
  # block stays empty — no S3 bucket, no AWS role, no workspaces.
  backend "http" {}

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.30"
    }
    external = {
      source  = "hashicorp/external"
      version = "~> 2.3"
    }
  }
}

# Authenticates via the CLOUDFLARE_API_TOKEN env var (provider-native): the
# token is an orun-managed secret resolved into the job env at run time —
# CLOUDFLARE_R2_TOKEN, minted from the r2-data template (component.yaml).
provider "cloudflare" {}

variable "cloudflare_account_id" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Cloudflare account ID (from CLOUDFLARE_ACCOUNT_ID env var)"
}

variable "orgName" {
  type    = string
  default = "sourceplane"
}

variable "owner" {
  type    = string
  default = "sourceplane"
}

variable "repo" {
  type    = string
  default = "ai-emoji-generator"
}

variable "namespace" {
  type    = string
  default = "sourceplane"
}

variable "namespacePrefix" {
  type    = string
  default = ""
}

variable "lane" {
  type    = string
  default = "verify"
}

variable "environment" {
  type    = string
  default = "stage"
}

variable "component" {
  type    = string
  default = "cloudflare-r2"
}

variable "stackName" {
  type    = string
  default = "cloudflare-r2"
}

variable "terraformDir" {
  type    = string
  default = "terraform"
}

variable "terraformVersion" {
  type    = string
  default = "1.15.3"
}

# --- The bucket the emojis' images live in ---
#
# One R2 bucket per environment, bound by apps/web as IMAGES: the webhooks
# write each emoji's original and background-removed PNG, the delivery route
# (/api/images/<key>) streams them back. It stands in for Vercel Blob. The
# bucket is private — nothing is served from it but through the Worker.

locals {
  # Built on var.repo (the product's repository slug) so the name is unique per
  # product. R2 bucket names are unique per account, and two products may
  # share an account — without the slug the second product's create would
  # find the name taken. The Worker binds the bucket by this name, via the
  # wiring secret.
  bucket_name = "${var.namespacePrefix}${var.repo}-${var.environment}"
}

resource "cloudflare_r2_bucket" "app" {
  account_id = var.cloudflare_account_id
  name       = local.bucket_name
}

# --- Wiring manifest (via orun secrets) ---
# Published post-apply as the WIRING_CLOUDFLARE_R2 secret on the project/{{env}}
# rung; the app's deploy reads it back as WIRING_CLOUDFLARE_R2_<ENV> and
# renders its wrangler template from it.

output "wiring" {
  description = "Wiring document for downstream deploy-time binding resolution (pushed to orun secrets)"
  value = jsonencode({
    r2_bucket_name = cloudflare_r2_bucket.app.name
  })
}

output "r2_bucket_name" {
  description = "Cloudflare R2 bucket name (the Workers binding's bucket_name)"
  value       = cloudflare_r2_bucket.app.name
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with Pages, Workers, KV, and Zone permissions."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID for the Pages and Worker resources."
  type        = string
}

variable "cloudflare_zone_name" {
  description = "The Cloudflare DNS zone for the custom domain."
  type        = string
  default     = "eastern-shore-solutions.com"
}

variable "pages_project_name" {
  description = "Cloudflare Pages project name."
  type        = string
  default     = "skill-builder-landing"
}

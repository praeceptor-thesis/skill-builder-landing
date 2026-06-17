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
  # Drives the Worker route (skills.<zone>/api/*), the Pages custom domain
  # (skills.<zone>), and the Resend email DNS in email.tf. Cut over to
  # dmzagent.com (2026-06) — old zone eastern-shore-solutions.com is retired.
  description = "The Cloudflare DNS zone for the registry domain."
  type        = string
  default     = "dmzagent.com"
}

variable "pages_project_name" {
  description = "Cloudflare Pages project name."
  type        = string
  default     = "skill-builder-landing"
}

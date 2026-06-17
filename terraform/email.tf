# ---------------------------------------------------------------------------
# Resend email-sending domain verification
#
# Resend generates the exact records when you add the sending domain in its
# dashboard (Domains -> Add Domain; recommend a subdomain such as
# "send.eastern-shore-solutions.com"). Copy those records into a tfvars file
# under `resend_dns_records`, then `terraform apply`.
#
# The map defaults to empty, so `terraform plan` stays clean until the domain
# exists in Resend and you have real values to paste.
#
# Typical records Resend returns (values are account-specific):
#   spf    TXT  send                "v=spf1 include:amazonses.com ~all"
#   mx     MX   send                "feedback-smtp.us-east-1.amazonses.com"  (priority 10)
#   dkim   TXT  resend._domainkey   "p=MIGfMA0GCSq...<long public key>"
#   dmarc  TXT  _dmarc              "v=DMARC1; p=none;"                      (optional, recommended)
#
# Example tfvars:
#   resend_dns_records = {
#     spf  = { type = "TXT", name = "send",              content = "v=spf1 include:amazonses.com ~all" }
#     mx   = { type = "MX",  name = "send",              content = "feedback-smtp.us-east-1.amazonses.com", priority = 10 }
#     dkim = { type = "TXT", name = "resend._domainkey", content = "p=MIGfMA0GCSq..." }
#   }
# ---------------------------------------------------------------------------

variable "resend_dns_records" {
  description = "DNS records Resend provides to verify the sending domain. Paste from the Resend dashboard; leave empty until the domain is added."
  type = map(object({
    type     = string
    name     = string
    content  = string
    priority = optional(number)
    ttl      = optional(number, 1)
    proxied  = optional(bool, false)
  }))
  default = {}
}

resource "cloudflare_dns_record" "resend" {
  for_each = var.resend_dns_records

  zone_id  = data.cloudflare_zone.site.id
  type     = each.value.type
  name     = each.value.name
  content  = each.value.content
  ttl      = each.value.ttl
  priority = each.value.priority
  proxied  = each.value.proxied
  comment  = "Resend email auth (${each.key})"
}

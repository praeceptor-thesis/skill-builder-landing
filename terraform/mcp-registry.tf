# ---------------------------------------------------------------------------
# Official MCP Registry — DNS ownership proof for the `com.dmzagent` namespace.
#
# The registry verifies domain ownership for domain-based server names
# (com.dmzagent/skill-builder-mcp) via an apex TXT record holding the PUBLIC
# half of an Ed25519 key pair. Generate the key locally — the PRIVATE half goes
# into the MCP_PRIVATE_KEY GitHub secret, never into this repo:
#
#   openssl genpkey -algorithm Ed25519 -out mcp-key.pem
#   # public key (base64) -> set as mcp_registry_public_key in tfvars:
#   openssl pkey -in mcp-key.pem -pubout -outform DER | tail -c 32 | base64
#   # private key (hex) -> set as the MCP_PRIVATE_KEY GitHub Actions secret:
#   openssl pkey -in mcp-key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n'
#
# Then `terraform apply`. Leave the var empty to skip the record entirely
# (keeps `terraform plan` clean until you have a key).
# ---------------------------------------------------------------------------

variable "mcp_registry_public_key" {
  description = "Base64 Ed25519 public key for MCP Registry DNS auth (v=MCPv1). Empty disables the record."
  type        = string
  default     = ""
}

resource "cloudflare_dns_record" "mcp_registry_auth" {
  count = var.mcp_registry_public_key == "" ? 0 : 1

  zone_id = data.cloudflare_zone.site.id
  type    = "TXT"
  name    = var.cloudflare_zone_name
  content = "v=MCPv1; k=ed25519; p=${var.mcp_registry_public_key}"
  ttl     = 1
  comment = "MCP Registry DNS auth (com.dmzagent namespace)"
}

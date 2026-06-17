# Sending the Skill Forge digest with Resend

The weekly digest (`scripts/skill-digest.mjs`) renders the email and can deliver it
through the [Resend](https://resend.com) HTTP API. Cloudflare is **not** an outbound
mail provider on its own — Email Routing is inbound-only and the old free
MailChannels/Workers path was retired in Aug 2024 — so Resend (which Cloudflare
itself now recommends) does the sending. The DNS that authenticates the domain
still lives in Cloudflare, managed here in `terraform/`.

## One-time setup

1. **Create a Resend account** and add a sending domain. A subdomain is recommended:
   `send.eastern-shore-solutions.com`. Resend shows you a set of DNS records (SPF
   TXT, a DKIM TXT at `resend._domainkey`, an MX for the return-path, optional DMARC).

2. **Add those records to Cloudflare via Terraform.** Paste the values Resend gives
   you into a tfvars file (e.g. `terraform/terraform.tfvars`), then apply:

   ```hcl
   resend_dns_records = {
     spf  = { type = "TXT", name = "send",              content = "v=spf1 include:amazonses.com ~all" }
     mx   = { type = "MX",  name = "send",              content = "feedback-smtp.us-east-1.amazonses.com", priority = 10 }
     dkim = { type = "TXT", name = "resend._domainkey", content = "p=MIGfMA0GCSq...<your key>" }
     # dmarc = { type = "TXT", name = "_dmarc",          content = "v=DMARC1; p=none;" }
   }
   ```

   ```bash
   cd terraform && terraform apply
   ```

   Back in Resend, click **Verify** once the records propagate (usually minutes).

3. **Set the API key** where the digest task runs. Add to the repo `.env`
   (already git-ignored):

   ```bash
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
   # optional overrides:
   MAIL_FROM="The Skill Forge <forge@send.eastern-shore-solutions.com>"
   MAIL_TO="matt@eastern-shore-solutions.com"
   ```

   The `MAIL_FROM` address **must** be on the domain you verified in Resend.

## Running

```bash
node scripts/skill-digest.mjs            # render only (writes the two files)
node scripts/skill-digest.mjs --dry-run  # render + report what would be sent, no API call
node scripts/skill-digest.mjs --send     # render + deliver via Resend
```

The script prints one JSON line. With `--send` it adds delivery fields:

```json
{ "...": "...", "from": "...", "sent": true, "resendId": "…", "sendError": null }
```

`--send` is a **safe no-op** until the key is present: if `RESEND_API_KEY` is
unset it reports `sent: false, sendError: "RESEND_API_KEY not set"` and exits 0,
so nothing breaks before setup is finished. Any Resend API error is caught and
returned in `sendError` (the script still exits 0).

## Notes

- **SMTP option:** Resend also offers an SMTP relay. If you'd rather send over SMTP,
  use `nodemailer` against `smtp.resend.com:465` with username `resend` and the API
  key as the password. The HTTP API is simpler here and is what `--send` uses.
- **From a Worker:** the same HTTP API call works inside a Cloudflare Worker
  (`fetch` to `api.resend.com`). Raw SMTP does **not** work from Workers.

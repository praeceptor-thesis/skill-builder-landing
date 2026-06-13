provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

data "cloudflare_zone" "site" {
  name = var.cloudflare_zone_name
}

resource "cloudflare_workers_kv_namespace" "skills" {
  account_id = var.cloudflare_account_id
  title      = "${var.pages_project_name}-skills"
}

resource "cloudflare_workers_script" "skill_api" {
  account_id = var.cloudflare_account_id
  name       = "${var.pages_project_name}-api"
  content    = file("${path.module}/../worker/skill-persistence-worker.js")
}

resource "cloudflare_workers_route" "api_route" {
  zone_id     = data.cloudflare_zone.site.id
  pattern     = "skills.${var.cloudflare_zone_name}/api/*"
  script_name = cloudflare_workers_script.skill_api.name
}

resource "cloudflare_pages_project" "site" {
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = "main"

  build_config {
    build_command   = "npm install && npm run build --workspace packages/web"
    destination_dir = "packages/web/dist"
  }
}

resource "cloudflare_pages_domain" "site_domain" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.site.name
  name         = "skills.${var.cloudflare_zone_name}"
}

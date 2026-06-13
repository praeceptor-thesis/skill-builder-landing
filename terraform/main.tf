provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

data "cloudflare_zone" "site" {
  name = var.cloudflare_zone_name
}

resource "cloudflare_workers_kv_namespace" "skills" {
  title = "${var.pages_project_name}-skills"
}

resource "cloudflare_worker_script" "skill_api" {
  name    = "${var.pages_project_name}-api"
  content = file("${path.module}/../worker/skill-persistence-worker.js")

  kv_namespace {
    binding      = "SKILL_STORE"
    namespace_id = cloudflare_workers_kv_namespace.skills.id
  }
}

resource "cloudflare_worker_route" "api_route" {
  zone_id     = data.cloudflare_zone.site.id
  pattern     = "skills.${var.cloudflare_zone_name}/api/*"
  script_name = cloudflare_worker_script.skill_api.name
}

resource "cloudflare_pages_project" "site" {
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = "main"

  build_config {
    root_dir        = "."
    build_command   = "npm install && npm run build --workspace packages/web"
    destination_dir = "packages/web/dist"
  }
}

resource "cloudflare_pages_custom_domain" "site_domain" {
  project_name = cloudflare_pages_project.site.name
  zone_id      = data.cloudflare_zone.site.id
  domain       = "skills.${var.cloudflare_zone_name}"
}

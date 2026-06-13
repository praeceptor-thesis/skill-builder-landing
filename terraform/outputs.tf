output "pages_project_name" {
  description = "The Cloudflare Pages project name."
  value       = cloudflare_pages_project.site.name
}

output "pages_custom_domain" {
  description = "The deployed Pages custom domain."
  value       = cloudflare_pages_custom_domain.site_domain.domain
}

output "worker_script_name" {
  description = "The Cloudflare Worker script name."
  value       = cloudflare_worker_script.skill_api.name
}

output "kv_namespace_id" {
  description = "The KV namespace ID used for skill persistence."
  value       = cloudflare_workers_kv_namespace.skills.id
}

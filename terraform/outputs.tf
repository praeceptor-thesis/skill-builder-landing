output "pages_project_name" {
  description = "The Cloudflare Pages project name."
  value       = cloudflare_pages_project.site.name
}

output "pages_custom_domain" {
  description = "The deployed Pages custom domain."
  value       = cloudflare_pages_domain.site_domain.name
}

output "worker_script_name" {
  description = "The Cloudflare Worker script name."
  value       = cloudflare_workers_script.skill_api.script_name
}

output "kv_namespace_id" {
  description = "The KV namespace ID used for skill persistence."
  value       = cloudflare_workers_kv_namespace.skills.id
}

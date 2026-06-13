#!/bin/bash
set -e

# This script imports existing Cloudflare resources into Terraform state
# Run this before terraform apply when resources already exist

echo "Importing existing Cloudflare resources..."

ZONE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=${TF_VAR_cloudflare_zone_name}" \
  -H "Authorization: Bearer ${TF_VAR_cloudflare_api_token}" \
  -H "Content-Type: application/json" | jq -r ".result[0].id")

echo "Zone ID: $ZONE_ID"

# Import KV namespace
# Query for the namespace ID by title
KV_NAMESPACE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/${TF_VAR_cloudflare_account_id}/storage/kv/namespaces" \
  -H "Authorization: Bearer ${TF_VAR_cloudflare_api_token}" \
  -H "Content-Type: application/json" | jq -r ".result[] | select(.title == \"${TF_VAR_pages_project_name}-skills\") | .id")

if [ -n "$KV_NAMESPACE_ID" ] && [ "$KV_NAMESPACE_ID" != "null" ]; then
  echo "Found KV namespace: $KV_NAMESPACE_ID"
  terraform import cloudflare_workers_kv_namespace.skills "${TF_VAR_cloudflare_account_id}/${KV_NAMESPACE_ID}" || true
else
  echo "KV namespace not found"
fi

# Import Pages project
# Query for the project ID by name
PAGES_PROJECT_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/${TF_VAR_cloudflare_account_id}/pages/projects" \
  -H "Authorization: Bearer ${TF_VAR_cloudflare_api_token}" \
  -H "Content-Type: application/json" | jq -r ".result[] | select(.name == \"${TF_VAR_pages_project_name}\") | .id")

if [ -n "$PAGES_PROJECT_ID" ] && [ "$PAGES_PROJECT_ID" != "null" ]; then
  echo "Found Pages project: $PAGES_PROJECT_ID"
  terraform import cloudflare_pages_project.site "${TF_VAR_cloudflare_account_id}/${PAGES_PROJECT_ID}" || true
else
  echo "Pages project not found"
fi

# Import Workers script (by script name)
terraform import cloudflare_workers_script.skill_api "${TF_VAR_cloudflare_account_id}/${TF_VAR_pages_project_name}-api" || true

# Import Workers route (by zone and pattern)
# Get route ID by pattern
ROUTE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes" \
  -H "Authorization: Bearer ${TF_VAR_cloudflare_api_token}" \
  -H "Content-Type: application/json" | jq -r ".result[] | select(.pattern == \"skills.${TF_VAR_cloudflare_zone_name}/api/*\") | .id")

if [ -n "$ROUTE_ID" ] && [ "$ROUTE_ID" != "null" ]; then
  echo "Found Workers route: $ROUTE_ID"
  terraform import cloudflare_workers_route.api_route "${ZONE_ID}/${ROUTE_ID}" || true
else
  echo "Workers route not found"
fi

echo "Import complete"


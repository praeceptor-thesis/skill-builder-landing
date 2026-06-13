#!/bin/bash
set +e

# This script imports existing Cloudflare resources into Terraform state
# Uses Python to parse JSON responses since jq may not be available

echo "Importing existing Cloudflare resources..."

# Function to make API calls
call_api() {
  local method=$1
  local endpoint=$2
  curl -s -X "$method" "https://api.cloudflare.com/client/v4$endpoint" \
    -H "Authorization: Bearer ${TF_VAR_cloudflare_api_token}" \
    -H "Content-Type: application/json"
}

# Try to get KV namespace ID
echo "Looking up KV namespace..."
KV_RESPONSE=$(call_api GET "/accounts/${TF_VAR_cloudflare_account_id}/storage/kv/namespaces")
KV_ID=$(echo "$KV_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); result = [r for r in data.get('result', []) if r.get('title') == '${TF_VAR_pages_project_name}-skills']; print(result[0]['id'] if result else '')" 2>/dev/null || echo "")

if [ -n "$KV_ID" ]; then
  echo "Found KV namespace: $KV_ID"
  terraform import -auto-approve cloudflare_workers_kv_namespace.skills "${TF_VAR_cloudflare_account_id}/${KV_ID}" 2>/dev/null || echo "KV namespace import skipped (already in state or error)"
else
  echo "KV namespace not found in API"
fi

# Try to get Pages project ID  
echo "Looking up Pages project..."
PAGES_RESPONSE=$(call_api GET "/accounts/${TF_VAR_cloudflare_account_id}/pages/projects")
PAGES_ID=$(echo "$PAGES_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); result = [r for r in data.get('result', []) if r.get('name') == '${TF_VAR_pages_project_name}']; print(result[0]['id'] if result else '')" 2>/dev/null || echo "")

if [ -n "$PAGES_ID" ]; then
  echo "Found Pages project: $PAGES_ID"
  terraform import -auto-approve cloudflare_pages_project.site "${TF_VAR_cloudflare_account_id}/${PAGES_ID}" 2>/dev/null || echo "Pages project import skipped (already in state or error)"
else
  echo "Pages project not found in API"
fi

# Try to get Workers script (by name)
echo "Looking up Workers script..."
SCRIPT_NAME="${TF_VAR_pages_project_name}-api"
terraform import -auto-approve cloudflare_workers_script.skill_api "${TF_VAR_cloudflare_account_id}/${SCRIPT_NAME}" 2>/dev/null || echo "Workers script import skipped (already in state or error)"

echo "Import complete (errors are normal if resources already imported)"
set -e




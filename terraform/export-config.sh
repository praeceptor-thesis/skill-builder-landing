#!/bin/bash
# This script generates deployment configuration from Terraform outputs

set -e

# Anchor to this script's directory so it works whether invoked from the repo
# root (terraform/export-config.sh) or from within terraform/ (./export-config.sh,
# as the deploy workflow does via working-directory).
cd "$(dirname "$0")"

# Get Terraform outputs
KV_NAMESPACE_ID=$(terraform output -raw kv_namespace_id 2>/dev/null || echo "")
PAGES_PROJECT_NAME=$(terraform output -raw pages_project_name 2>/dev/null || echo "skill-builder-landing")
WORKER_SCRIPT_NAME=$(terraform output -raw worker_script_name 2>/dev/null || echo "skill-builder-landing-api")

echo "Deployment Configuration:"
echo "KV Namespace ID: $KV_NAMESPACE_ID"
echo "Pages Project: $PAGES_PROJECT_NAME"
echo "Worker Script: $WORKER_SCRIPT_NAME"

# Export for workflow steps
echo "KV_NAMESPACE_ID=$KV_NAMESPACE_ID" >> $GITHUB_ENV
echo "PAGES_PROJECT_NAME=$PAGES_PROJECT_NAME" >> $GITHUB_ENV
echo "WORKER_SCRIPT_NAME=$WORKER_SCRIPT_NAME" >> $GITHUB_ENV

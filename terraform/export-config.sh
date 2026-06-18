#!/bin/bash
# This script generates deployment configuration from Terraform outputs

set -e

# Anchor to this script's directory so it works whether invoked from the repo
# root (terraform/export-config.sh) or from within terraform/ (./export-config.sh,
# as the deploy workflow does via working-directory).
cd "$(dirname "$0")"

# Read a Terraform output as a clean, single-line value or fall back to a default.
# Guards against the hashicorp/setup-terraform wrapper printing "::error::"
# annotations to stdout when an output is missing or the backend is unreachable
# (e.g. this step runs without backend creds) — capturing that text would
# otherwise corrupt the GITHUB_ENV file and fail the job.
tf_output() {
  local name="$1" default="$2" val
  val="$(terraform output -raw "$name" 2>/dev/null | head -n1)"
  case "$val" in
    "" | *"::error::"* | *"exited with code"*) printf '%s' "$default" ;;
    *) printf '%s' "$val" ;;
  esac
}

KV_NAMESPACE_ID="$(tf_output kv_namespace_id "")"
PAGES_PROJECT_NAME="$(tf_output pages_project_name "skill-builder-landing")"
WORKER_SCRIPT_NAME="$(tf_output worker_script_name "skill-builder-landing-api")"

echo "Deployment Configuration:"
echo "KV Namespace ID: $KV_NAMESPACE_ID"
echo "Pages Project: $PAGES_PROJECT_NAME"
echo "Worker Script: $WORKER_SCRIPT_NAME"

# Export for later workflow steps (only when running inside GitHub Actions).
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "KV_NAMESPACE_ID=$KV_NAMESPACE_ID" >> "$GITHUB_ENV"
  echo "PAGES_PROJECT_NAME=$PAGES_PROJECT_NAME" >> "$GITHUB_ENV"
  echo "WORKER_SCRIPT_NAME=$WORKER_SCRIPT_NAME" >> "$GITHUB_ENV"
fi

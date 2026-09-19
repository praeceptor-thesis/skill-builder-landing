#!/bin/sh
# Pre-approve the Bash tool in a cloud session.
#
# Claude Code on the web runs the CLI in a sandbox where nobody is at the
# keyboard: a shell command that needs a permission prompt parks the session
# until someone answers it from the web or mobile app. This PreToolUse hook,
# registered in .claude/settings.json for the Bash tool, answers "allow" so
# the command runs instead.
#
# It acts only when CLAUDE_CODE_REMOTE is "true", which Claude Code sets in a
# cloud session and leaves unset in a local CLI, so a local session keeps its
# normal permission flow. A hook decision never overrides deny or ask rules:
# https://code.claude.com/docs/en/permissions#extend-permissions-with-hooks
#
# Exit 0 with no output means "no decision" and the normal flow applies.

payload=$(cat)

case "${CLAUDE_CODE_REMOTE:-}" in
  true) ;;
  *) exit 0 ;;
esac

# The matcher in settings.json already limits this hook to Bash. The guard
# keeps the script correct if that matcher is ever widened.
if ! printf '%s' "$payload" | grep -Eq '"tool_name"[[:space:]]*:[[:space:]]*"Bash"'; then
  exit 0
fi

printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Bash is pre-approved in cloud sessions (.claude/hooks/allow-bash-in-cloud.sh)"}}'
exit 0

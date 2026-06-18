/** Shared constants for the skill-builder MCP server. */

/** Default registry API base. Overridable via SKILL_API_URL. */
export const DEFAULT_API_URL = "https://skills.dmzagent.com/api";

/** Public web app, used for human-facing links in tool output. */
export const WEB_BASE_URL = "https://skills.dmzagent.com";

/** Max characters a single tool response may emit before we truncate. */
export const CHARACTER_LIMIT = 25000;

/** HTTP timeout for registry requests, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 30000;

export const SERVER_NAME = "skill-builder-mcp-server";
export const SERVER_VERSION = "1.0.0";

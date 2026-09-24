# Hamster MCP Account

Canonical source: `skills/ask-hamster/references/mcp-account.md`. It is copied byte-for-byte into ship, plan-hamster, and resume-hamster because every skill directory is self-contained; `scripts/validate-plugin.mjs` rejects divergent copies. Edit the canonical file and copy it to all three.

Every Hamster MCP tool acts on the user's active MCP team, not on this repository's team. A user in more than one team who never picked one gets an arbitrary team, and tools like `get_task` or `ask_hamster` then report work that exists as not found.

Skip this when the client has no Hamster MCP tools, when they include no `switch_account` (the server has pinned the session to one team), or when the repository root (`git rev-parse --show-toplevel`) has no `.hamster/.state.json` (not initialized; the setup skill handles that). Otherwise switch before the first Hamster MCP call in this session, and again before each `ask_hamster` call or call that creates or changes Hamster data:

1. Take `account_slug` from `.hamster/.state.json` at the repository root. If Account Resolution already ran, use its `ACCOUNT_RESOLVED` value.
2. Call `switch_account` with `{"account_slug": "<slug>"}`. Don't check first: `list_accounts` doesn't say which team is active, and switching to the active team is harmless.
3. Continue only if it succeeds and returns that `account_slug`. On any failure, make no other Hamster MCP calls: tell the user the MCP team couldn't be set, quote the error, and stop. For `account with slug "<slug>" not found`, call `list_accounts` first. If one of its teams has the state file's `account_id`, the team was renamed: tell the user to run `hamster init --force --account-id <id>` in this repository, which re-syncs under the new slug. Otherwise the MCP sign-in can't see this team (often a different user than the CLI).

The selection is saved per user, so another session can switch it away. If a later Hamster MCP call reports something this repository's plan shows as not found, switch again and retry once. If it's still missing, report it as missing from team `<slug>`.

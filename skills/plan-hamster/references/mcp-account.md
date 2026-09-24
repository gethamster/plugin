# Hamster MCP Account

Canonical source: `skills/ask-hamster/references/mcp-account.md`. It is copied byte-for-byte into ship, plan-hamster, and resume-hamster because every skill directory is self-contained; `scripts/validate-plugin.mjs` rejects divergent copies. Edit the canonical file and copy it to all three.

Every Hamster MCP tool acts on the user's active MCP team, not on this repository's team. A user in more than one team who never picked one gets an arbitrary team, and tools like `get_task` or `ask_hamster` then report work that exists as not found.

Skip this when the client has no Hamster MCP tools, when they include no `switch_account` (the server has pinned the session to one team), or when the repository root (`git rev-parse --show-toplevel`) has no `.hamster/.state.json` (not initialized; the setup skill handles that). Otherwise switch before the first Hamster MCP call in this session, and again before each `ask_hamster` call or call that creates or changes Hamster data:

1. Take `account_slug` and `account_id` from `.hamster/.state.json` at the repository root. If Account Resolution already ran, its `ACCOUNT_RESOLVED` value is that `account_slug`.
2. Call `switch_account` with `{"account_slug": "<slug>"}`. Don't check first: `list_accounts` doesn't say which team is active, and switching to the active team is harmless.
3. Continue if it succeeds and returns that `account_slug`. If it fails, call `list_accounts`:
   - If a team there has the state file's `account_id` under a different slug, the team was renamed. Call `switch_account` with that team's current slug, and continue if it succeeds. Use the new slug for every later switch in this session, but keep the state file's slug for local `.hamster/` paths. Tell the user once that this repository's Hamster state still has the old slug, and to run `hamster init --force --account-id <id>` here to refresh it.
   - Otherwise, including when no team has that `account_id` (the MCP sign-in can't see this team, often a different user than the CLI), make no other Hamster MCP calls: tell the user the MCP team couldn't be set, quote the error, and stop.

The selection is saved per user, not per session or client. Switching here also changes the team the user's other Hamster MCP clients use until they switch again, and another session can switch it away. If a later Hamster MCP call reports something this repository's plan shows as not found, switch again and retry once. If it's still missing, report it as missing from team `<slug>`.

# Hamster MCP Account

Canonical source: `skills/ask-hamster/references/mcp-account.md`. It is copied byte-for-byte into ship, plan-hamster, and resume-hamster because every skill directory is self-contained; `scripts/validate-plugin.mjs` rejects divergent copies. Edit the canonical file and copy it to all three.

Every Hamster MCP tool acts on the user's active MCP team, not on this repository's team. A user in more than one team who never picked one gets an arbitrary team, and tools like `get_task` or `ask_hamster` then report work that exists as not found.

Skip this when the client has no Hamster MCP tools, when they include no `switch_account` (the server has pinned the session to one team), or when the repository root (`git rev-parse --show-toplevel`) has no `.hamster/.state.json` (not initialized; the setup skill handles that). Otherwise switch before the first Hamster MCP call in this session, and again before each `ask_hamster` call or call that creates or changes Hamster data:

1. Take `account_slug` from `.hamster/.state.json` at the repository root. If Account Resolution already ran, its `ACCOUNT_RESOLVED` value is that slug.
2. Call `switch_account` with `{"account_slug": "<slug>"}`. Don't check first: `list_accounts` doesn't say which team is active, and switching to the active team is harmless.
3. Continue only if it succeeds. If it fails for any reason, make no further Hamster MCP calls, including `list_accounts`, and don't pick another team yourself, even one with the same name. Tell the user in one line that this repository's Hamster team (`<slug>`) isn't available to this MCP sign-in, and to run `hamster init --force` in the repository or sign in to Hamster MCP as the right user. Then stop.

The selection is saved per user, not per session or client, so switching here also changes the team the user's other Hamster MCP clients use until they switch again.

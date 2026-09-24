# Hamster MCP Account

Canonical source: `skills/ask-hamster/references/mcp-account.md`. It is copied byte-for-byte into ship, plan-hamster, and resume-hamster because every skill directory is self-contained; `scripts/validate-plugin.mjs` rejects divergent copies. Edit the canonical file and copy it to all three.

Every Hamster MCP tool acts on the user's active MCP team, not on this repository's team. A user in more than one team who never picked one gets an arbitrary team, and tools like `get_task` or `ask_hamster` then report work that exists as not found.

Skip this when the client has no Hamster MCP tools, or when this repository has no `.hamster/.state.json` (not initialized; the setup skill handles that). Otherwise, before the first other Hamster MCP call in this session:

1. Take `account_slug` from `.hamster/.state.json`. If Account Resolution already ran, use its `ACCOUNT_RESOLVED` value.
2. Call `switch_account` with `{"account_slug": "<slug>"}`. Call it every time: `list_accounts` doesn't say which team is active, and switching to the current team is harmless.
3. If it fails with `account with slug "<slug>" not found`, the MCP sign-in can't see this repository's team (often a different user than the CLI). Tell the user and stop rather than query another team.

The selection is saved per user, so another session can switch it away. If a later Hamster MCP call reports something this repository's plan shows as not found, call `switch_account` again and retry once.

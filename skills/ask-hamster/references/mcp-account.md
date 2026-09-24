# Hamster MCP Account

Every Hamster MCP tool acts on the user's active MCP team, not on this repository's team. A user in more than one team who never picked one gets an arbitrary team, and tools like `get_task` or `ask_hamster` then report work that exists as not found.

Skip this when the client has no Hamster MCP tools, when they include no `switch_account` (the server has pinned the session to one team), or when the repository root (`git rev-parse --show-toplevel`) has no `.hamster/.state.json` (not initialized; the setup skill handles that). Otherwise switch before the first Hamster MCP call in this session, and again before each `ask_hamster` call or call that creates or changes Hamster data:

1. Take `account_slug` and `account_id` from `.hamster/.state.json` at the repository root. They name the user's Hamster CLI team as of the last `hamster sync` here.
2. Call `switch_account` with `{"account_slug": "<slug>"}`. Don't check first: `list_accounts` doesn't say which team is active, and switching to the active team is harmless.
3. Continue only if it succeeds and returns the same `account_id`. A renamed team's old slug can now belong to another team. If it fails or the id differs, make no further Hamster MCP calls, including `list_accounts`, don't pick another team yourself, even one with the same name, and don't look the item up anywhere else (CLI, web). `hamster chat` takes its team from the CLI's own settings, not this repository, so it can hit a different team. Tell the user in one line that this repository's Hamster team (`<slug>`) isn't available to this MCP sign-in, and to run `hamster init --force` in the repository or sign in to Hamster MCP as the right user. Then stop.

The selection is saved per user, not per session or client, so switching here also changes the team the user's other Hamster MCP clients use until they switch again.

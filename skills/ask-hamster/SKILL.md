---
name: ask-hamster
description: Ask Hamster to connect the current code or editor context with workspace priorities, blockers, blueprints, related work, or intent. Also supports workspace actions when the user explicitly requests one.
---

# Ask Hamster

**Request**: "$ARGUMENTS"

If this client has the Hamster MCP tools (hosted at `https://tryhamster.com/mcp`), point them at this repository's team before the first Hamster MCP call in this session (even `get_task` or `search`), and again before each `ask_hamster` call or any call that creates or changes Hamster data: if `.hamster/.state.json` exists at the repository root (`git rev-parse --show-toplevel`) and the tools include `switch_account`, call it with the file's `account_slug`, then compare the `account_id` it returns with the file's `account_id`. If the switch fails or the two ids differ, make no more Hamster MCP calls (not even `list_accounts`, or a switch to another team with the same name), don't fall back to `hamster chat`, and don't look the item up anywhere else (including the web): tell the user in one line that this repository's Hamster team (`<account_slug>`) isn't available to this MCP sign-in, and to run `hamster init --force` here or sign in to Hamster MCP as the right user, then stop. Read [mcp-account](references/mcp-account.md) for the reasons behind these rules.

Then call the `ask_hamster` tool (or the client's equivalent Hamster MCP ask tool) with the request. Include local working context Hamster cannot see on its own: file paths, the current branch and diff, error messages, and the code under discussion.

If Hamster MCP tools are unavailable, use `hamster chat` when the CLI is installed and signed in — same ask path, different transport:

```bash
hamster chat "<request>"
```

For a genuine follow-up on that CLI path, use `hamster chat --continue "<follow-up>"`. If MCP is unavailable and the CLI is not ready, tell the user to finish the client's Hamster sign-in prompt, or to follow the setup skill or https://tryhamster.com/plugin/install and run `hamster auth login`.

If `$ARGUMENTS` is empty, ask the user what they want to ask Hamster.

Let the response finish. Some requests take time. If the tool returns a pending thread, wait and fetch the reply with the returned thread id. Do not start a second ask to poll status.

When a follow-up depends on the previous response, continue the same conversation by passing the thread id. Start a new thread for an unrelated request.

When the user explicitly requests an action, report whether Hamster applied the change or only proposed it. If the tool fails, report the failure instead of guessing.

See [examples](references/examples.md) for representative questions, actions, and follow-ups.

---
name: sign-in
description: Connect this client to the Supabuild MCP server and sign in with OAuth. Use on first run, when the Supabuild tools are missing or ask you to sign in, when calls start failing because the sign-in expired, or to switch the connected project.
---

# Sign in to Supabuild

The plugin registers Supabuild's remote MCP server under the name `hamster`. The client runs the OAuth sign-in and stores the token. Never ask the user to paste a token into chat, and never read, print, or pass one yourself.

## How sign-in works

1. The user starts the sign-in from their client (see the list below). The client registers itself with Supabuild on first use, so there is nothing to configure.
2. The browser opens Supabuild's sign-in page. The user signs in, chooses the one project this connection may use, and approves access.
3. The client finishes the flow, and the Supabuild tools appear. Some clients show them only in a new session or after a restart.

Wait for the user to finish in the browser. If the client reports an error, show it to the user and stop.

## One project per connection

Each connection can reach only the project chosen when signing in. To work in another project, the user signs out of the `hamster` server in their client (or clears its stored sign-in) and signs in again, choosing the other project. If the user asks about a project this connection doesn't cover, say so instead of guessing.

## When the sign-in expires

Supabuild issues no refresh tokens, so the client can't renew a sign-in by itself. When the token expires, calls that worked before start failing with an authorization error, such as 401, "unauthorized", or "needs authentication". This is expected. Tell the user to sign in again with the same step for their client below; if the client offers to re-authenticate or clear the sign-in, that is the same thing. If signing in again still fails, report the client's error and stop.

## Sign in, by client

- Claude Code: open `/mcp`, select `plugin:hamster:hamster`, and authenticate.
- Codex: run `codex mcp login hamster` in a terminal.
- Copilot CLI: run `/mcp auth hamster`.
- Gemini CLI: run `/mcp auth hamster`.
- Grok Build: open `/mcps`, select `hamster`, and press `i`.
- Cursor: follow Cursor's sign-in prompt for the `hamster` server.
- Antigravity: in the CLI, open `/mcp`, select `hamster_hamster`, then Authenticate; in the app, select Authenticate on `hamster_hamster` under Settings → Customizations → Installed MCP Servers.
- OpenCode: run `opencode mcp auth hamster` in a terminal.
- Pi: run `pi mcp login hamster` in a terminal.

## When the client has no Supabuild server

Some installs carry the skills without the MCP server: OpenCode and Pi install only the skills, and a client may have been set up by hand. Tell the user to add the server, then sign in. Run these in a terminal:

- Codex: `codex mcp add hamster --url https://supabuild.invalid/mcp`, then `codex mcp login hamster`.
- OpenCode: `opencode mcp add hamster --url https://supabuild.invalid/mcp`, then `opencode mcp auth hamster`.
- Pi: `pi mcp add hamster --url https://supabuild.invalid/mcp`, then `pi mcp login hamster`.

In any other client, add `https://supabuild.invalid/mcp` as a remote MCP server named `hamster` and sign in through the client's OAuth flow.

## Finish

Sign-in is done when the Supabuild tools are listed in the client. Continue with what the user asked for.

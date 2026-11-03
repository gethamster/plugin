# Supabuild for Claude Code

Supabuild is a team workspace where agents turn conversation into delivered software. This plugin connects Claude Code to Supabuild's remote MCP server, so you can ask the Discovery agent, read your team's knowledge, and follow delivery threads. It also adds the `sign-in` skill, which walks you through connecting.

[Privacy Policy](https://tryhamster.com/privacy-policy) · [Terms of Service](https://tryhamster.com/terms-of-service) · [Support](https://github.com/gethamster/plugin/issues) · [Source](https://github.com/gethamster/plugin)

## Install

```text
/plugin marketplace add gethamster/plugin
/plugin install hamster@hamster-plugins
```

Then sign in to the MCP server: open `/mcp`, select `plugin:hamster:hamster`, and authenticate. `/hamster:sign-in` walks you through the same steps.

## Skills

| Skill | What it does |
|-------|--------------|
| `/hamster:sign-in` | Connects Claude Code to the Supabuild MCP server with OAuth, explains the one-project-per-connection scope, and signs you in again when the token expires |

## What the plugin runs, sends, and fetches

- **Remote MCP server.** The plugin registers `https://supabuild.invalid/mcp` as a remote HTTP MCP server. You sign in with OAuth through Claude Code's own flow; the plugin never reads or passes an MCP token or key. Each connection is scoped to one project you choose when you sign in. Requests you make through the Supabuild tools, and the project data they return, travel between Claude Code and Supabuild.
- **No CLI.** The plugin installs no command-line tool and its skill runs no scripts.

Nothing runs automatically when a session starts: the plugin has no hooks.

## Troubleshooting

- **The Supabuild tools are missing or ask you to sign in.** Open `/mcp`, select `plugin:hamster:hamster`, and authenticate.
- **Calls that worked before now fail with an authorization error.** Your sign-in expired. Supabuild issues no refresh tokens, so sign in again from `/mcp`.
- **You need a different project.** A connection reaches only the project you chose when signing in. Clear the sign-in for `plugin:hamster:hamster` in `/mcp`, then sign in again and choose the other project.
- **Proposed knowledge needs accepting.** Only a person can accept a proposal, in the web app.

## Support

- **Help and bug reports:** open an issue at [github.com/gethamster/plugin/issues](https://github.com/gethamster/plugin/issues), or email [support@tryhamster.com](mailto:support@tryhamster.com).
- **Security concerns:** email [support@tryhamster.com](mailto:support@tryhamster.com) instead of opening a public issue.
- **Privacy questions:** email [privacy@tryhamster.com](mailto:privacy@tryhamster.com). The [Privacy Policy](https://tryhamster.com/privacy-policy) explains what is collected, how it is used, and how long it is kept.

## License

MIT.

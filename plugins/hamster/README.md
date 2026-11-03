# Supabuild for Claude Code

Supabuild is a team workspace where agents turn conversation into delivered software. This plugin connects Claude Code to Supabuild's remote MCP server, so you can ask the Discovery agent, read your team's knowledge, and follow delivery threads, and adds four skills that teach Claude Code those tools.

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
| `/hamster:discovery-agent` | Asks the Discovery agent to research, answer, draft proposed knowledge, or start a delivery thread, and follows the ask until it finishes (`create`, `message`, `read`, `update`, `delete`) |
| `/hamster:team-knowledge` | Reads the team's published knowledge, in the document types your team uses, and gathers the guidance a feature must follow (`search`, `read`) |
| `/hamster:delivery-threads` | Follows delivery threads, shows what each is waiting for, and steers, answers or retries them when you ask (`read`, `message`, `update`, `create`) |

## Example prompts

Sign in first (see Install). These prompts work against any Supabuild project with published knowledge and at least one delivery thread.

1. **See what the team decided.** `/hamster:team-knowledge What decisions has my team accepted, and which proposals are still waiting for a person?` Claude lists accepted decisions with their standing and points you to each open proposal's page in the web app. It changes nothing.
2. **Prepare to build a feature.** `/hamster:team-knowledge Gather the guidance that applies to adding a coupon field to checkout.` Claude returns the required guidance, says why each part applies, and flags any gaps before you start.
3. **Ask the Discovery agent.** `/hamster:discovery-agent Which open questions are blocking our current work?` Claude sends the ask and, if it takes longer than about 50 seconds, follows it until the answer arrives. If the agent has questions, Claude shows them to you instead of answering for you.
4. **Check on delivery.** `/hamster:delivery-threads Which threads need my attention, and what is each one waiting for?` Claude reads each thread's state and says when a person must act, with a link to the thread in the web app.
5. **Steer a thread.** `/hamster:delivery-threads Tell the checkout thread to add a test for the empty cart case.` Claude sends that guidance once and confirms it. A retry after a dropped connection reuses the same operation ID, so the guidance isn't sent twice.

## What the plugin runs, sends, and fetches

- **Remote MCP server.** The plugin registers `https://supabuild.invalid/mcp` as a remote HTTP MCP server. You sign in with OAuth through Claude Code's own flow; the plugin never reads or passes an MCP token or key. Each connection is scoped to one project you choose when you sign in. Requests you make through the Supabuild tools, and the project data they return, travel between Claude Code and Supabuild.
- **No CLI.** The plugin installs no command-line tool and its skills run no scripts.

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
